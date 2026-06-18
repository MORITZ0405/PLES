# LEST — Lightweight Easy Server Toolkit

**Design Specification v1 (authoritative)**

LEST is an original, clean-room, self-hosted web-hosting control panel for Linux servers. It manages nginx virtual hosts, Linux system users with isolated home directories and SFTP, MySQL/MariaDB and PostgreSQL databases and users, and Let's Encrypt (ACME) certificates, behind a multi-tenant model of customers → plans → subscriptions → domains. It contains no Plesk/cPanel source, trademarks, branding, or proprietary assets.

This document is the definitive spec. It resolves all open questions decisively. Where the three source proposals disagreed, the resolution is stated and is final.

---

## 1. Overview & Non-Goals for v1

### What LEST is
A two-tier system running on a real Linux server:

- An **unprivileged control plane** (web API + React SPA + background worker) that owns all business logic and the panel's own metadata database. It runs as the unprivileged OS user `lest` and is treated as **already compromised** for threat-modeling purposes.
- A **privileged node-agent** (`lest-agentd`) that runs as root (capability-scoped) and is the *only* component that performs privileged host mutations. It accepts a closed, schema-validated command set over a local Unix socket, **re-derives resource ownership from its own read-only view of the metadata DB**, renders all config server-side, and executes only via `execFile` (never a shell).

### v1 feature pillars (frozen scope)
1. **Domains & Websites** — nginx vhost generation, per-site PHP version (php-fpm pool), HTTPS mode.
2. **Databases** — MySQL/MariaDB and PostgreSQL: databases + database users + scoped grants.
3. **SSL** — Let's Encrypt / ACME issuance + auto-renewal (http-01).
4. **Customers / multi-tenant** — customers → plans → subscriptions → domains, with resource limits and roles `admin` / `reseller` / `customer`; SFTP users per subscription.

### Architectural commitments carried from day one (cheap now, expensive later)
- **The control plane owns no host state directly.** It *always* talks to a node-agent, even on localhost. There is no "direct exec from the API" code path, ever.
- **Every host mutation is a durable, idempotent, replayable `ReconcileIntent`.** This gives idempotent upgrades, ret/backoff on failure, DR-replay, and a complete forensic trail.
- **A `Server` entity exists from v1** (always one row, `local`), so single-node → multi-server is a transport swap (unix socket → mTLS), not a schema/interface rewrite.

### Non-goals for v1
- Email / mailboxes / IMAP / SMTP.
- DNS as a managed service. `DnsProvider` interface ships, but the only v1 implementation is `NoopDnsProvider` (and a mock). dns-01 / wildcard certs are deferred.
- Multi-server orchestration **execution** (the data model and transport seam are ready; the enrollment/scheduler UI is post-v1).
- Firewall / fail2ban / WAF management.
- Backups beyond the metadata DB dump + ReconcileIntent replay design (full per-subscription tarball tooling is M-late / post-v1).
- Reseller white-label branding (post-v1).
- Stateless JWTs — sessions are server-side and revocable.

---

## 2. Monorepo Layout

pnpm workspace + Turborepo. pnpm for strict, content-addressed `node_modules` (smaller dependency-confusion surface); Turborepo for the cached task graph and enforced build ordering (`contracts` before everything; `agent` independently buildable).

```
lest/
├─ package.json                       # workspace root; pinned engines; "packageManager" field; turbo scripts
├─ pnpm-workspace.yaml
├─ turbo.json                         # build/test/lint pipeline + caching; ^build ordering
├─ tsconfig.base.json                 # strict:true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, project refs
│
├─ packages/
│  ├─ contracts/                      # ZERO runtime deps. THE single source of truth for every boundary.
│  │  └─ src/
│  │     ├─ ipc/commands.ts           #   discriminated union of every privileged command + Zod schema (the wire contract)
│  │     ├─ ipc/responses.ts          #   typed results + typed AgentError codes
│  │     ├─ ipc/envelope.ts           #   { v, id, ts, hmac, idempotencyKey, command } envelope + codec
│  │     ├─ http/dto.ts               #   request/response DTOs shared api<->web
│  │     └─ validation/idents.ts      #   branded refined primitives: DomainName, DbIdent, UnixUsername, AbsPath, Port, PhpVersion
│  │
│  ├─ config/                         # typed, Zod-validated env/config loader; the one place that knows paths/sockets/secret sources
│  ├─ observability/                  # pino logger factory, OpenTelemetry setup, Prometheus registry, audit-log helper
│  │
│  ├─ db/                             # Drizzle schema (one file per aggregate) + migrations + repositories.
│  │  └─ src/
│  │     ├─ schema/                   #   full multi-tenant schema incl. Server, ReconcileIntent, AuditEvent
│  │     ├─ migrations/               #   drizzle-kit generated .sql (reviewable, DBA-runnable)
│  │     ├─ getDb.ts                  #   dual-dialect factory: better-sqlite3 (dev) | node-postgres (prod) by DATABASE_URL
│  │     └─ agentView.ts              #   READ-ONLY repository surface the agent uses for ownership re-derivation
│  │
│  ├─ core/                           # pure domain logic, framework-free, no I/O except via injected providers
│  │  └─ src/
│  │     ├─ services/                 #   CustomerService, PlanService, SubscriptionService, DomainService, QuotaService
│  │     ├─ reconciler/               #   desired-state -> ReconcileIntent generation + reconcile loop logic
│  │     ├─ providers/index.ts        #   PROVIDER INTERFACES (WebServer/SystemUser/Database/Cert/Dns) + AgentClient interface
│  │     └─ rbac/                     #   role/subtree scoping rules
│  │
│  ├─ rendering/                      # nginx vhost + php-fpm pool + cert-path templates (eta) + escaping helpers.
│  │                                  #   Imported ONLY by the agent. The API never renders config.
│  │
│  ├─ providers-mock/                 # Windows-dev + test impls. File/in-memory fakes. InProcessAgent. Imported by api(dev) + all tests.
│  ├─ providers-linux/                # REAL impls. Each method translates to agent commands via AgentClient. Imported ONLY by agent.
│  │
│  └─ test-utils/                     # fixtures, mock-agent harness, integration bootstrap, contract-drift tests
│
├─ apps/
│  ├─ api/                            # UNPRIVILEGED web-facing control plane (Fastify). Runs as user `lest`. Owns metadata DB + HTTP + auth.
│  │  └─ src/
│  │     ├─ http/                     #   Fastify app, routes, auth middleware, RBAC guards, rate limits
│  │     ├─ ipc/SocketAgentClient.ts  #   opens unix socket, signs HMAC envelope, awaits typed response
│  │     ├─ container.ts              #   composition root: picks providers-mock+InProcessAgent OR SocketAgentClient by env
│  │     └─ audit/                    #   append-only audit writer
│  │
│  ├─ worker/                         # background job runner. ACME issue/renew, reconcile loop, usage/size collection.
│  │                                  #   Shares core/db; runs as `lest`; talks to agent exactly like api.
│  │
│  ├─ web/                            # React + TS SPA (Vite). Pure client. Talks only to api over HTTPS.
│  │  └─ src/{routes,pages,components,api-client}/
│  │
│  └─ agent/                          # PRIVILEGED daemon lest-agentd. Root/cap-scoped. NO inbound network.
│     └─ src/
│        ├─ server.ts                 #   unix-socket listener, SO_PEERCRED check, HMAC verify, replay window
│        ├─ dispatch.ts               #   command -> handler map (default-deny static whitelist)
│        ├─ ownership.ts              #   re-derives canonical idents from subscriptionId via db/agentView (read-only)
│        ├─ handlers/                 #   one file per command family: webserver, sysuser, db, cert, dns
│        ├─ exec/safeExec.ts          #   execFile-only wrapper (never sh -c); argv arrays; stdin for secrets
│        └─ limits.ts                 #   per-verb rate limits, global concurrency cap, per-command deadlines, kill-switch
│
├─ deploy/
│  ├─ install.sh                      # idempotent installer: creates lest user, dirs, socket perms, installs systemd units
│  ├─ systemd/lest-api.service        # User=lest; hardened (ProtectSystem=strict, empty CapabilityBoundingSet, PrivateTmp)
│  ├─ systemd/lest-worker.service     # User=lest; same hardening
│  ├─ systemd/lest-agentd.service     # root, cap-scoped (AmbientCapabilities); socket-activated; sandboxed
│  ├─ systemd/lest-agentd.socket      # SocketUser=root SocketGroup=lest dir 0750 SocketMode=0660
│  └─ runbooks/{upgrade.md,restore.md}
│
├─ e2e/                               # Playwright over the mock stack (CI, no privileges)
└─ DESIGN.md                          # this document
```

---

## 3. Tech Choices

| Concern | Choice | One-line rationale |
|---|---|---|
| ORM (metadata DB only) | **Drizzle ORM** | One TS schema compiles to better-sqlite3 (dev) and node-postgres (prod); no query-engine binary to ship/harden; plain reviewable `.sql` migrations a DBA can run during DR; types inferred with no codegen step. |
| Metadata DB | **SQLite (better-sqlite3) in dev, PostgreSQL (node-postgres) in prod** | Satisfies the dev-on-Windows / prod-on-Linux requirement from a single schema. |
| Web framework (api) | **Fastify** | Fast, schema-first, first-class Zod integration, mature plugin ecosystem, trivially unprivileged. |
| API transport | **REST/JSON** (versioned `/api/v1`) | Explicit, language-neutral, easy to audit and rate-limit at the edge; no engine coupling. |
| Validation | **Zod** (in `contracts/`) | One schema set validated on BOTH sides of every boundary (HTTP edge + agent wire); guarantees dev/prod parity. |
| Background jobs | **BullMQ + Redis** (worker) | Durable retries/backoff for ACME and reconcile; isolated from the request path. Redis is the only added infra dep; acceptable for the operational guarantees. |
| Frontend build | **Vite + React + TypeScript** | Fast HMR, native on Windows, zero binary downloads. |
| Frontend routing/data | **TanStack Router + TanStack Query** | Type-safe routing + cache/invalidation against the REST client. |
| Frontend UI | **Tailwind CSS + shadcn/ui (Radix)** | Original design system, accessible primitives, no proprietary assets. |
| Auth | **argon2id passwords + server-side revocable sessions + TOTP** | Revocable sessions (no stateless JWT) so a compromised token can be killed; TOTP for admin/reseller. |
| Config templating | **eta** (in `rendering/`, agent-only) | Sandboxed, fast, simple; config is rendered on the privileged side from validated fields, never on the web tier. |
| Process supervision | **systemd** (units + socket activation) | Hardening directives, socket activation, watchdog, capability scoping. |

> Decision: **REST over tRPC.** Proposal 2's tRPC gives nicer end-to-end types, but a clean, versioned, language-neutral REST surface is easier to rate-limit, audit, and reason about on an internet-facing panel, and decouples the SPA from the server's internal router shape. We keep Proposal 2's *type-safety win* by sharing Zod DTOs from `contracts/` and generating a typed fetch client for the SPA — without coupling to tRPC.

---

## 4. Security Architecture

This is the heart of LEST. The governing principle: **the web-facing process is treated as already compromised.** It holds no root, no capabilities, no sudo rights, and no privileged secrets. It can only *request* narrowly-typed, schema-validated, ownership-checked operations from the privileged daemon.

### 4.1 Chosen design: separate privileged daemon over a local Unix socket

A long-lived **privileged daemon `lest-agentd`** listens on a local Unix-domain socket and speaks a strict, whitelisted, Zod-validated, length-prefixed JSON command protocol.

**Rejected alternatives (final):**
- **sudoers-restricted helper CLI** — rejected. sudoers argument allowlisting is glob-weak and a perennial source of quoting/IFS/argv-injection CVEs; it scatters validation across shell wrappers and gives the web process the right to fork privileged processes directly.
- **systemd-run + polkit** — rejected as the primary mechanism. Couples tightly to systemd, is impossible to mock on Windows, is a poor place to express per-tenant authorization, and still leaves someone to assemble argv safely. *Retained only as a hardening layer* (the daemon runs under systemd sandboxing).

The daemon approach gives one narrow auditable boundary, validation in real typed code, and — critically — the same `contracts/` Zod command types describe the in-process mock on Windows and the real socket call on Linux, and **generalize to multi-server for free** (swap the unix socket for mTLS; the protocol is identical).

### 4.2 Components & the trust boundary

```
┌──────────────────────────── UNTRUSTED (user `lest`, internet-exposed) ─────────────────────────────┐
│   apps/web  ──HTTPS──>  apps/api  ──┐                                                                │
│                          apps/worker┘── SocketAgentClient (HMAC-signs envelopes)                    │
│   Holds: metadata DB (rw), sessions, RBAC, quota logic.                                              │
│   Holds NO: root, caps, sudo, MySQL/PG root creds, ACME account key.                                │
└───────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                 │  /run/lest/agentd.sock   (dir 0750 root:lest, sock 0660)
                                                 │  THE SINGLE TRUST BOUNDARY. No TCP. IPAddressDeny=any.
┌────────────────────────────────────────────────▼─────────── TRUSTED (root, cap-scoped) ─────────────┐
│   apps/agent  lest-agentd                                                                            │
│     1. SO_PEERCRED: peer uid == uid('lest') else drop                                                │
│     2. HMAC verify (key 0640 root:lest, rotated per deploy) + ts within 30s + id unseen (nonce cache)│
│     3. Zod validate command (same contracts schema)                                                  │
│     4. OWNERSHIP RE-DERIVATION: recompute canonical idents from subscriptionId via read-only DB view │
│     5. limits: per-verb rate limit + concurrency cap + deadline + kill-switch                        │
│     6. handler -> rendering/ (server-side templates) -> safeExec(execFile, argv, stdin-secrets)      │
│   Holds: MySQL/PG admin creds, ACME account key (0600 root). Read-only DB view for ownership.        │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The socket is created by the `lest-agentd.socket` systemd unit: directory `0750 root:lest`, `SocketMode=0660`, so **only the `lest` user can connect**. The daemon additionally calls `getsockopt(SO_PEERCRED)` and asserts the peer uid equals `lest`'s uid; anything else is dropped. The agent unit sets `IPAddressDeny=any` and binds no port.

### 4.3 The single most important control: agent-side ownership re-derivation

Both judges single this out as the decisive differentiator. **The daemon never trusts the web tier's claim about who owns a resource.**

Every command carries a `ctx` with `{requestId, actorUserId, subscriptionId}`. The daemon, using its **own read-only view of the metadata DB** (`db/agentView`), independently re-derives the canonical resource namespace it is about to touch — the unix username, the db name, the docroot — *from the subscriptionId*, and refuses any command whose target identifiers don't match what that subscription is allowed to own. Platform-level/destructive operations additionally require a valid admin `Session` row to exist in the DB.

Consequence: a fully popped web process **cannot** `useradd` uid 0, drop a database it doesn't own, or write a vhost for another tenant's domain by lying about `subscriptionId`. The HMAC authenticates the *channel*, not the *role*; authorization is re-checked against DB state on the privileged side.

> This makes **metadata-DB integrity a tier-1 asset.** It is protected by: strict Drizzle parameterization (no string-built SQL), RBAC on every write path, the daemon enforcing platform-vs-tenant scoping independently, and DB-level revocation of `UPDATE`/`DELETE` on the audit table for the `lest` role.

### 4.4 Command protocol

Newline/length-prefixed JSON, one request → one response, correlated by `id`.

**Envelope** (`contracts/ipc/envelope.ts`):
```jsonc
{
  "v": 1,
  "id": "0f5d...uuid",            // correlation id
  "ts": 1750000000000,            // ms epoch; must be within 30s window
  "idempotencyKey": "ri_8f2a...", // ties to a ReconcileIntent row; replay-safe
  "hmac": "base64(HMAC-SHA256(key, canonicalize(body)))",
  "command": { /* the discriminated-union command, below */ }
}
```

The daemon proceeds past the parser **only if**: (1) HMAC verifies, (2) `ts` within window, (3) `id` unseen (nonce cache), (4) full Zod schema passes, (5) ownership re-derivation passes, (6) rate/concurrency/deadline limits allow. Any failure → typed `AgentError`, audited, connection stays safe.

**Commands** (`contracts/ipc/commands.ts`) — closed discriminated union; **there is deliberately no `runShell` verb** and **no raw-config-content command** (config is rendered inside the daemon from validated fields — Proposal 2's `content: string` vhost command is explicitly rejected as the most dangerous single command in any proposal):

```ts
import { z } from 'zod';

export const DomainName = z.string().min(1).max(253)
  .transform(s => s.toLowerCase())
  .refine(s => /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(s), 'invalid fqdn');
export const PhpVersion = z.enum(['7.4', '8.1', '8.2', '8.3']);   // daemon-hardcoded allowlist
export const DbEngine = z.enum(['mysql', 'postgres']);
export const GrantSet = z.array(z.enum(['SELECT','INSERT','UPDATE','DELETE','ALL'])).nonempty();

export const SubjectCtx = z.object({
  requestId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  subscriptionId: z.string().uuid(),   // daemon re-derives ownership FROM this
}).strict();

export const Command = z.discriminatedUnion('type', [
  // WebServer — daemon renders config from these fields; never accepts raw config text
  z.object({ type: z.literal('webserver.upsertVhost'), ctx: SubjectCtx,
    domainId: z.string().uuid(), fqdn: DomainName, aliases: z.array(DomainName).max(50).default([]),
    phpVersion: PhpVersion.nullable(), httpsMode: z.enum(['off','redirect','only']) }).strict(),
  z.object({ type: z.literal('webserver.removeVhost'), ctx: SubjectCtx, domainId: z.string().uuid() }).strict(),

  // System users — daemon derives username/uid; never user-supplied
  z.object({ type: z.literal('sysuser.ensure'), ctx: SubjectCtx }).strict(),
  z.object({ type: z.literal('sysuser.setPassword'), ctx: SubjectCtx,
    sftpUserId: z.string().uuid(), password: z.string().min(16).max(256) }).strict(),  // via chpasswd stdin
  z.object({ type: z.literal('sysuser.remove'), ctx: SubjectCtx }).strict(),

  // Databases — server-generated namespaced names; grants templated (no SUPER / WITH GRANT OPTION)
  z.object({ type: z.literal('db.create'), ctx: SubjectCtx, engine: DbEngine, databaseId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('db.drop'),   ctx: SubjectCtx, engine: DbEngine, databaseId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('db.upsertUser'), ctx: SubjectCtx, engine: DbEngine,
    databaseUserId: z.string().uuid(), password: z.string().min(16).max(256) }).strict(),
  z.object({ type: z.literal('db.grant'), ctx: SubjectCtx, engine: DbEngine,
    databaseUserId: z.string().uuid(), privileges: GrantSet }).strict(),

  // Certs — certbot --webroot, fixed argv
  z.object({ type: z.literal('cert.issue'), ctx: SubjectCtx, domainId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('cert.renew'), ctx: SubjectCtx, certificateId: z.string().uuid() }).strict(),

  // Operational
  z.object({ type: z.literal('admin.killSwitch'), ctx: SubjectCtx, enabled: z.boolean() }).strict(),
]);
export type Command = z.infer<typeof Command>;
```

**Responses** (`contracts/ipc/responses.ts`):
```ts
export type AgentError =
  | { code: 'UNAUTHORIZED' }
  | { code: 'OWNERSHIP_MISMATCH' }
  | { code: 'VALIDATION'; detail?: string }
  | { code: 'RATE_LIMITED' | 'CONCURRENCY_LIMITED' | 'DEADLINE_EXCEEDED' }
  | { code: 'CONFLICT' }
  | { code: 'SYSTEM_FAILURE'; retriable: boolean };

export type AgentResponse<T = unknown> =
  | { id: string; ok: true; result: T }
  | { id: string; ok: false; error: AgentError };
```

**Example exchange** — issue a vhost (request line then response line):

```jsonc
// api -> agentd
{ "v":1, "id":"a1b2c3d4-...", "ts":1750000000123, "idempotencyKey":"ri_7c1f...",
  "hmac":"k3J9...==",
  "command": { "type":"webserver.upsertVhost",
    "ctx": { "requestId":"a1b2c3d4-...", "actorUserId":"u-991e-...", "subscriptionId":"s-44ad-..." },
    "domainId":"d-0f12-...", "fqdn":"shop.example.com", "aliases":["www.shop.example.com"],
    "phpVersion":"8.2", "httpsMode":"redirect" } }

// agentd -> api  (after: peercred ok, hmac ok, ts ok, id unseen, zod ok,
//                 ownership: domain d-0f12 belongs to subscription s-44ad -> docroot /var/www/lest_44ad...,
//                 render template -> nginx -t passes -> atomic rename -> systemctl reload nginx)
{ "id":"a1b2c3d4-...", "ok":true, "result": { "vhostPath":"/etc/nginx/sites-available/d-0f12.conf", "reloaded":true } }
```

### 4.5 Input validation rules (layered, fail-closed)

1. **API edge:** Zod `.strict()` on every HTTP body; unknown keys rejected.
2. **Wire:** the **same** `contracts/` Zod schema re-validates inside the daemon — the agent never trusts the api's validation.
3. **Identifier hardening:**
   - Domains: IDNA/punycode normalize → strict label regex with length caps.
   - DB names and unix usernames are **server-generated** with a tenant prefix (`lest_<8hex subId>_<slug>`), never free-form — kills collisions and reserved-name attacks (cannot create `root`, cannot collide with system accounts). Username regex floor: `^lest_[a-z0-9]{1,24}$`.
   - uids: allocated from a reserved LEST range above a hard floor; refuses system uids; server-side allocation table prevents reuse.
   - PHP version: must be a member of the daemon-hardcoded enum, never a path.
   - Ports/integers: range-checked.
4. **Path confinement:** every filesystem path is `realpath`-resolved and asserted to `startsWith` an allowlisted root (`/var/www/<lest_user>`, `/etc/nginx/sites-available`, `/etc/letsencrypt`); `..` rejected pre- and post-normalization. Docroots are server-generated under a fixed base, never accepted from the client.
5. **No shell, ever:** all OS commands go through `safeExec` → `execFile(binary, argvArray, { shell: false })`. No code path builds a shell string. `certbot`/`useradd`/`nginx`/`mysql`/`psql`/`systemctl` get fixed argv arrays whose only variable parts are pre-validated identifiers as discrete argv elements. **Passwords go via stdin (`chpasswd`), never argv.** An eslint `no-restricted-imports`/`no-restricted-syntax` rule bans `child_process.exec`/`execSync` and any non-`safeExec` exec; a CI gate enforces it.
6. **Config generation is templated, not concatenated:** nginx/php-fpm rendered by `rendering/` from fixed templates, every interpolated value grammar-escaped and re-validated, written to a daemon-owned temp file, `nginx -t`-tested, then **atomically renamed** + symlinked, then `systemctl reload nginx`. A failed `nginx -t` aborts and never reloads.
7. **DB DDL:** parameterized admin connections; identifiers that can't be parameterized are regex-validated (`^[a-z0-9_]{1,32}$`), engine-correctly quoted, and server-generated anyway. **Grant templating structurally refuses `SUPER` and `WITH GRANT OPTION`**; user creation forces a non-superuser role.
8. **Rate / concurrency / deadline:** per-verb rate limits, a global concurrency cap, and a per-command deadline (a hung `certbot` cannot wedge the agent). Destructive ops (`db.drop`, `sysuser.remove`) are rate-limited and refuse bulk destruction outside a maintenance flag. A `killSwitch` verb can freeze the agent.

### 4.6 What a compromised web process can and cannot do

**Cannot:**
- Gain root, capabilities, or sudo — it holds none; `ProtectSystem=strict` + empty `CapabilityBoundingSet` on the api/worker units.
- Read `/etc/shadow`, MySQL/PG root creds, or the ACME account key — those live only on the daemon side (`0600` root).
- Run arbitrary commands — only the closed verb set, each `execFile`-only, each argv pre-validated, no shell metacharacters reachable.
- Escalate cross-tenant — the daemon re-derives ownership from `subscriptionId` against its read-only DB view and rejects mismatches (`OWNERSHIP_MISMATCH`).
- Create a non-`lest_` Linux user, a uid-0 user, or a DB superuser — server-generated namespaced idents + uid floor + grant templating forbid it.
- Write outside allowlisted roots — `realpath` confinement.
- Inject nginx directives — no raw config crosses the wire; config is rendered server-side from validated fields and `nginx -t`-gated.
- Tamper with the audit trail — DB-level `UPDATE`/`DELETE` revoked for the `lest` role; no update/delete code paths.
- Reach the agent over the network — `IPAddressDeny=any`, Unix socket only, `SO_PEERCRED` enforced.

**Can (and is contained/audited):**
- Send well-formed commands the daemon already authorizes, scoped to subscriptions that exist and that the supplied `subjectCtx` legitimately owns — i.e. only operations a legitimate session could have triggered.
- Be fully reconstructed forensically — every command is appended to the audit log **before and after** execution with `requestId`/`idempotencyKey`/outcome.

### 4.7 Daemon hardening (systemd)
`lest-agentd`: root-launched then dropped to `AmbientCapabilities=CAP_SETUID CAP_SETGID CAP_CHOWN CAP_DAC_OVERRIDE` (not persistent full root), `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome` scoped to home roots, `ProtectKernelTunables`, `ProtectControlGroups`, `RestrictSUIDSGID`, `RestrictAddressFamilies=AF_UNIX`, `SystemCallFilter=@system-service`, `IPAddressDeny=any`, `ReadWritePaths=/etc/nginx /etc/letsencrypt /etc/php /var/www /var/lib/lest`, optional seccomp profile. `lest-api`/`lest-worker`: `User=lest`, `PrivateTmp`, `ProtectHome`, `ProtectSystem=strict`, `CapabilityBoundingSet=` (empty), `ReadWritePaths=` data dir only.

---

## 5. Data Model

Prisma-style sketch (implemented in Drizzle; SQLite dev / Postgres prod). All ids are UUID PKs. JSON columns use the portable Drizzle JSON helper.

```prisma
// ---------- Identity & tenancy ----------
model User {
  id              String   @id @default(uuid())
  email           String   @unique            // citext in PG; case-insensitive in app for sqlite
  passwordHash    String                        // argon2id
  totpSecret      String?                       // encrypted; required for admin/reseller
  role            Role                          // admin | reseller | customer
  customerId      String?                       // null for platform admin
  status          UserStatus                    // active | disabled
  failedLoginCount Int     @default(0)
  lockedUntil     DateTime?
  customer        Customer? @relation(fields: [customerId], references: [id])
  sessions        Session[]
  auditEvents     AuditEvent[] @relation("actor")
}

model Customer {
  id               String   @id @default(uuid())
  parentResellerId String?                       // self-ref reseller tree; null = platform-owned
  name             String
  status           CustomerStatus                // active | suspended
  parentReseller   Customer? @relation("resellerTree", fields: [parentResellerId], references: [id])
  children         Customer[] @relation("resellerTree")
  users            User[]
  subscriptions    Subscription[]
}

model Plan {
  id              String   @id @default(uuid())
  ownerScope      OwnerScope                     // platform | reseller
  ownerResellerId String?                        // set when reseller-owned; bounded by reseller ceiling
  name            String
  status          PlanStatus
  limits          Json     // { maxDomains, maxDbs, maxDbSizeMb, maxSftpUsers, diskMb, maxCerts, allowedPhpVersions[] }
  subscriptions   Subscription[]
}

model Subscription {
  id               String   @id @default(uuid())
  customerId       String
  planId           String
  serverId         String                        // FK Server; multi-server-ready (always 'local' in v1)
  state            SubState                       // active | suspended | terminated
  effectiveLimits  Json     // frozen snapshot of Plan.limits at bind time; overridable per-subscription
  diskUsedMb       Int      @default(0)           // cached, refreshed by worker
  customer         Customer @relation(fields: [customerId], references: [id])
  plan             Plan     @relation(fields: [planId], references: [id])
  server           Server   @relation(fields: [serverId], references: [id])
  systemUser       SystemUser?                    // one primary system user owning docroots
  domains          Domain[]
  databases        Database[]
  sftpUsers        SftpUser[]
}

// ---------- Host-facing resources ----------
model Server {
  id              String   @id @default(uuid())   // one row 'local' in v1
  hostname        String
  agentEndpoint   String                           // unix:///run/lest/agentd.sock (v1) | mtls://host:port (future)
  publicIp        String?
  status          ServerStatus                     // online | degraded | offline
  capabilities    Json     // { phpVersions[], hasMysql, hasPostgres }
  lastHeartbeatAt DateTime?
  subscriptions   Subscription[]
}

model SystemUser {
  id            String   @id @default(uuid())
  subscriptionId String  @unique
  serverId      String
  unixUsername  String   @unique                   // server-generated lest_<8hex>_<slug>
  uid           Int?     @unique                    // allocated from reserved range; null until provisioned
  homeDir       String                              // /var/www/<unixUsername>, 0750
  shell         String   @default("/usr/sbin/nologin")
  state         ResourceState
  subscription  Subscription @relation(fields: [subscriptionId], references: [id])
  sftpUsers     SftpUser[]
}

model Domain {
  id            String   @id @default(uuid())
  subscriptionId String
  fqdn          String   @unique                    // IDNA-normalized
  type          DomainType                          // primary | addon | subdomain | alias
  docRoot       String                              // server-generated under home
  phpVersion    String?                             // member of plan allowlist
  vhostState    VhostState                          // pending | live | disabled
  httpsMode     HttpsMode                           // off | redirect | only
  subscription  Subscription @relation(fields: [subscriptionId], references: [id])
  certificates  Certificate[]
  dnsRecords    DnsRecord[]
}

model Database {
  id            String   @id @default(uuid())
  subscriptionId String
  serverId      String
  engine        DbEngine                            // mysql | postgres
  dbName        String                              // server-generated namespaced; unique per engine/server
  sizeBytesCached BigInt @default(0)
  state         ResourceState
  subscription  Subscription @relation(fields: [subscriptionId], references: [id])
  users         DatabaseUser[]
}

model DatabaseUser {
  id            String   @id @default(uuid())
  databaseId    String
  engine        DbEngine
  username      String                              // server-generated namespaced
  grants        Json     // ['SELECT','INSERT',...]; never SUPER/WITH GRANT OPTION
  passwordSetAt DateTime?
  database      Database @relation(fields: [databaseId], references: [id])
}

model Certificate {
  id            String   @id @default(uuid())
  domainId      String
  serverId      String
  provider      CertProviderKind @default(letsencrypt)
  status        CertStatus                          // pending | issued | renewing | failed
  sans          Json
  notBefore     DateTime?
  notAfter      DateTime?
  fingerprint   String?
  keyPath       String?
  chainPath     String?
  autoRenew     Boolean  @default(true)
  domain        Domain   @relation(fields: [domainId], references: [id])
}

model SftpUser {
  id            String   @id @default(uuid())
  systemUserId  String
  subscriptionId String
  unixUsername  String                              // namespaced
  chrootDir     String                              // sshd Match + ChrootDirectory, root:root 0755 + writable subdir
  state         ResourceState
  systemUser    SystemUser @relation(fields: [systemUserId], references: [id])
}

model DnsRecord {
  id            String   @id @default(uuid())
  domainId      String
  type          DnsType                             // A | CNAME | TXT
  name          String
  value         String
  ttl           Int      @default(3600)
  managed       Boolean  @default(false)            // Noop provider in v1
  domain        Domain   @relation(fields: [domainId], references: [id])
}

// ---------- Operations & integrity ----------
model ReconcileIntent {
  id             String   @id @default(uuid())
  serverId       String
  subscriptionId String
  kind           IntentKind   // upsertVhost | removeVhost | ensureSysUser | createDb | dropDb | grant | issueCert | renewCert ...
  targetType     String
  targetId       String
  desiredState   Json
  status         IntentStatus // pending | applied | failed
  attempts       Int      @default(0)
  lastError      String?
  idempotencyKey String   @unique                    // dedupe + ties to the agent envelope
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model AuditEvent {
  id            String   @id @default(uuid())
  at            DateTime @default(now())
  actorUserId   String?
  actorIp       String?
  action        String                                // enum-constrained in app
  targetType    String?
  targetId      String?
  requestId     String?
  commandHash   String?                               // hash of the agent command (not its secrets)
  outcome       AuditOutcome                           // ok | denied | error
  detailJson    Json?
  actor         User?    @relation("actor", fields: [actorUserId], references: [id])
  // APPEND-ONLY: UPDATE/DELETE revoked at DB level for the `lest` role.
}

model Session {
  id          String   @id @default(uuid())
  userId      String
  tokenHash   String                                  // sha256 of opaque cookie; no stateless JWT
  createdAt   DateTime @default(now())
  lastSeenAt  DateTime @default(now())
  expiresAt   DateTime
  ip          String?
  userAgent   String?
  revokedAt   DateTime?
  user        User     @relation(fields: [userId], references: [id])
}

enum Role { admin reseller customer }
enum OwnerScope { platform reseller }
enum DbEngine { mysql postgres }
enum HttpsMode { off redirect only }
// ... (remaining enums elided for brevity; defined in db/schema)
```

**Key relational invariants:** `Subscription` is the quota anchor (every Domain/Database/SftpUser counts against `effectiveLimits`). `Plan.limits` is snapshotted into `Subscription.effectiveLimits` at bind time — changing a plan never silently mutates active subscriptions. Resellers may only define plans/subscriptions within their own ceiling (recursive check in `QuotaService`). `SystemUser` is never reused across customers.

---

## 6. Provider Abstraction

Interfaces live in `packages/core/src/providers`. Real implementations (`providers-linux`) translate each call into agent commands via `AgentClient`; mock implementations (`providers-mock`) do local file/in-memory work. Every method is idempotent and takes a `ctx` for audit + multi-server routing. **The `api`/`worker` never construct providers directly — only the composition root does, only behind these interfaces.**

```ts
// packages/core/src/providers/index.ts

export interface ProviderCtx { requestId: string; actorUserId: string; subscriptionId: string; serverId: string; }

// The single chokepoint to the trust boundary.
export interface AgentClient {
  send<T = unknown>(ctx: ProviderCtx, command: Command, idempotencyKey: string): Promise<AgentResponse<T>>;
  ping(): Promise<{ ok: true; version: string }>;
}

export interface WebServerProvider {
  upsertVhost(ctx: ProviderCtx, spec: VhostSpec): Promise<void>; // render(daemon) -> nginx -t -> atomic swap -> reload
  removeVhost(ctx: ProviderCtx, domainId: string): Promise<void>;
  reload(ctx: ProviderCtx): Promise<void>;
}
export interface VhostSpec {
  domainId: string; fqdn: string; aliases: string[];
  docRoot: string;                 // server-generated; confined under /var/www/<lest_user>
  phpVersion: '7.4'|'8.1'|'8.2'|'8.3'|null;
  httpsMode: 'off'|'redirect'|'only';
  certPath?: string; keyPath?: string;
}

export interface SystemUserProvider {
  ensure(ctx: ProviderCtx): Promise<{ unixUsername: string; uid: number; homeDir: string }>; // daemon derives names
  setPassword(ctx: ProviderCtx, sftpUserId: string, password: string): Promise<void>;          // chpasswd via stdin
  remove(ctx: ProviderCtx): Promise<void>;
  getUsage(ctx: ProviderCtx): Promise<{ diskMb: number }>;
}

export interface DatabaseProvider {
  readonly engine: 'mysql' | 'postgres';
  createDatabase(ctx: ProviderCtx, databaseId: string): Promise<void>;
  dropDatabase(ctx: ProviderCtx, databaseId: string): Promise<void>;
  upsertUser(ctx: ProviderCtx, databaseUserId: string, password: string): Promise<void>;
  grant(ctx: ProviderCtx, databaseUserId: string, privileges: Array<'SELECT'|'INSERT'|'UPDATE'|'DELETE'|'ALL'>): Promise<void>; // no SUPER/GRANT OPTION
  getSize(ctx: ProviderCtx, databaseId: string): Promise<{ sizeMb: number }>;
}

export interface CertProvider {
  issue(ctx: ProviderCtx, domainId: string): Promise<CertResult>;     // certbot certonly --webroot, fixed argv
  renew(ctx: ProviderCtx, certificateId: string): Promise<CertResult>;
}
export interface CertResult { certificateId: string; notAfter: string; keyPath: string; chainPath: string; sans: string[]; }

// v1 default = NoopDnsProvider; interface exists for forward-compat (dns-01/wildcard later).
export interface DnsProvider {
  upsertRecord(ctx: ProviderCtx, r: { domainId: string; type: 'A'|'CNAME'|'TXT'; name: string; value: string; ttl?: number }): Promise<void>;
  deleteRecord(ctx: ProviderCtx, r: { domainId: string; type: string; name: string }): Promise<void>;
}
```

### Real-vs-mock selection

Single typed factory at the **composition root** (`apps/api/src/container.ts`, mirrored in `worker`), driven by Zod-validated env — never scattered `if(os)` checks:

```ts
// LEST_MODE = 'mock' (default on win32) | 'agent' (default on linux)
function createProviders(cfg: Config) {
  if (cfg.mode === 'mock') {
    const agent = new InProcessAgent(mockHandlers);   // calls mock providers synchronously; no socket
    return buildMockProviders(agent);                 // writes to ./.lest-dev/{nginx,users,certs}
  }
  const agent = new SocketAgentClient(cfg.agentSocketPath); // signs HMAC, JSONL over unix socket
  return buildLinuxProviders(agent);                  // providers-linux only
}
```

**Hard boundary, CI-enforced:** `providers-linux` is **not** a dependency of `apps/api`/`apps/worker`. An eslint `no-restricted-imports` rule + a CI dependency-graph check fail the build if the web tier imports privileged code. The web tier cannot even *import* the real providers.

Both `InProcessAgent` (mock) and `SocketAgentClient` (real) and the daemon itself share the **same `contracts/` Zod command types**, so a command that type-checks in dev is exactly what the Linux daemon validates — genuine dev/prod parity at the seam. The mock agent faithfully simulates failure paths (`nginx -t` failure, `OWNERSHIP_MISMATCH`, rate-limit) so they are exercisable on Windows.

---

## 7. REST API Surface

Versioned under `/api/v1`. Cookie-based session auth; RBAC + reseller-subtree scoping on every route; mutating routes are rate-limited and write an `AuditEvent`.

**Auth & account**
```
POST   /api/v1/auth/login            # email + password (+ TOTP); lockout-aware; sets httpOnly session cookie
POST   /api/v1/auth/logout
GET    /api/v1/auth/me               # current user, role, effective limits
POST   /api/v1/auth/totp/enroll
POST   /api/v1/auth/totp/verify
GET    /api/v1/account/sessions      # list active sessions
DELETE /api/v1/account/sessions/:id  # revoke a session
POST   /api/v1/account/password
```

**Customers / Plans / Subscriptions** (reseller-subtree scoped)
```
GET/POST        /api/v1/customers
GET/PATCH/DELETE /api/v1/customers/:id
GET/POST        /api/v1/plans
GET/PATCH/DELETE /api/v1/plans/:id
GET/POST        /api/v1/subscriptions
GET/PATCH       /api/v1/subscriptions/:id
POST            /api/v1/subscriptions/:id/suspend | /resume
```

**Domains & Websites**
```
GET/POST        /api/v1/subscriptions/:id/domains
GET/PATCH/DELETE /api/v1/domains/:id
POST            /api/v1/domains/:id/vhost/apply     # -> WebServerProvider (creates ReconcileIntent)
PATCH           /api/v1/domains/:id/php-version
```

**Databases**
```
GET/POST        /api/v1/subscriptions/:id/databases
DELETE          /api/v1/databases/:id               # rate-limited destructive op
GET/POST        /api/v1/databases/:id/users
POST            /api/v1/database-users/:id/password
POST            /api/v1/database-users/:id/grants
```

**SSL / Certificates**
```
POST            /api/v1/domains/:id/certificates/issue
POST            /api/v1/certificates/:id/renew
GET             /api/v1/certificates/:id
```

**SFTP**
```
GET/POST        /api/v1/subscriptions/:id/sftp-users
POST            /api/v1/sftp-users/:id/password
DELETE          /api/v1/sftp-users/:id
```

**Operations & platform**
```
GET             /api/v1/servers ; GET /api/v1/servers/:id     # admin; heartbeat/capabilities; enrollment hook (future)
GET             /api/v1/reconcile-intents/:id                  # surface pending/failed host ops to UI
GET             /api/v1/audit                                  # read-only, admin/reseller-scoped, filterable
```

**Unauthenticated / infra**
```
GET             /.well-known/acme-challenge/:token             # http-01 webroot adapter
GET             /api/v1/health                                 # liveness
GET             /api/v1/ready                                  # deep readiness incl. agent socket reachability
GET             /metrics                                       # Prometheus, bound to internal interface only
```

---

## 8. Frontend

Vite + React + TS, TanStack Router + Query, Tailwind + shadcn/ui. Pure client; talks only to `/api/v1` over HTTPS using a typed fetch client generated from `contracts/` DTOs.

### Routes / pages
```
/login                         Login (password + TOTP, lockout messaging)
/                              Dashboard — tenant-scoped usage vs plan limits; cert-expiry warnings; recent audit
/customers                     Customers list (reseller sees only its subtree)
/customers/:id                 Customer detail
/plans                         Plans editor (platform + reseller-owned)
/subscriptions                 Subscriptions list
/subscriptions/:id             Subscription detail (state, limits, owning system user, usage bars)
/domains                       Domains list + create wizard
/domains/:id                   Domain detail (docroot, PHP version, vhost status, nginx-test result, HTTPS mode)
/domains/:id/ssl               SSL panel (status, expiry, issue/renew)
/databases                     Databases list + create (engine toggle)
/databases/:id                 Database detail (users, grants, size vs quota)
/sftp                          SFTP users panel (chroot jail info, set password)
/audit                         Audit log viewer (filter by actor/action/target; read-only)
/operations                    Jobs + ReconcileIntent queue (pending/failed/retry) — admin
/settings                      Account & security (password, TOTP, active sessions w/ revoke)
```

### Component structure
```
src/
  routes/                 TanStack Router route tree (file-based), per-route loaders using the typed client
  api-client/             generated typed fetch client + React Query hooks (useDomains, useSubscription, ...)
  components/
    primitives/           shadcn/ui wrappers (Button, Dialog, Table, Form, Toast)
    layout/               AppShell, Sidebar (role-aware nav), TopBar, TenantSwitcher
    domain/               DomainCard, VhostStatusBadge, PhpVersionSelect, NginxTestResult
    database/             DbList, GrantEditor, DbSizeBar
    cert/                 CertStatus, ExpiryBadge, IssueRenewButton
    quota/                UsageBar, LimitMatrix
    audit/                AuditTable, AuditFilters
  lib/                    auth context, RBAC guards (<RequireRole>), formatters, error boundary
  pages/                  page compositions per route
```

RBAC is enforced server-side (authoritative); the SPA additionally hides/disables controls by role for UX. All destructive actions use a confirm dialog and surface the resulting `ReconcileIntent` status.

---

## 9. Dev-on-Windows vs Prod-on-Linux

Selection is **one composition-root decision** driven by `config` (`LEST_MODE`), defaulting to `mock` on win32 and `agent` on linux. No feature code branches on platform.

**Dev (Windows), `LEST_MODE=mock`:**
- Composition root injects `providers-mock` + an `InProcessAgent` that calls mock handlers synchronously — no daemon, no socket, no root.
- Mocks produce realistic artifacts: nginx vhost text under `./.lest-dev/etc/nginx`, a JSON-backed user/db registry, self-signed "certs" so the SSL UI is exercisable.
- Metadata DB = SQLite (`better-sqlite3`) at `./.lest-dev/lest.db` via `getDb()`; `drizzle-kit push` for fast iteration. **Pin a Node/Windows combo with `better-sqlite3` prebuilt binaries** to avoid node-gyp friction (a real solo-dev trap).
- The full UI/API/RBAC/quota/reconcile stack runs on Windows with zero Linux dependencies.

**Prod (Linux), `LEST_MODE=agent`:**
- `api`/`worker` (user `lest`) inject `SocketAgentClient` → `/run/lest/agentd.sock` and hold no providers.
- `lest-agentd` (separate process, `providers-linux` + `rendering`) is the only place real providers and privileged secrets exist.
- Metadata DB = PostgreSQL via `node-postgres`; `drizzle-kit generate` + `migrate` (versioned SQL, DBA-runnable during DR).

**Parity & drift control:**
- `api`/`worker` and `agent` share **only** `contracts/`, so identical Zod validation runs on both sides; mock mode accepts exactly the same command shapes as agent mode.
- CI runs the full **mock stack + Playwright** on Windows/Linux runners with no privileges.
- A separate **Linux-container CI job** exercises `api → real SocketAgentClient → lest-agentd → providers-linux` against throwaway nginx/mysql/postgres, asserting trust-boundary behavior: SO_PEERCRED rejection, HMAC rejection, replay rejection, `OWNERSHIP_MISMATCH` rejection, and `nginx -t` failure aborting the reload.
- Both dialects (SQLite + Postgres-in-Docker) run the test suite in CI to catch type/JSON/concurrency drift.

**Quota correctness across dialects:** quota checks happen inside the same DB transaction as the resource creation, with a row lock on the `Subscription` (`SELECT … FOR UPDATE` on Postgres; serialized write on SQLite), so two concurrent creates cannot both pass a near-full check.

---

## 10. Build Milestones (implementation order)

**The privileged trust boundary is built and rejection-tested *before* any real handler exists** — the crown jewel must be the most-tested component, not the last (explicitly rejecting Proposal 2's build-it-last ordering).

- **M0 — Foundations.** pnpm + Turborepo monorepo; `tsconfig.base` strict + project refs; `contracts/` (Zod command/response/envelope schemas + branded identifier primitives); `config/` and `observability/` (pino/OTel/Prometheus + audit helper); eslint import-boundary rule (api/worker must not import `providers-linux`; ban `child_process.exec`/`execSync`); CI skeleton green on Windows.

- **M1 — Runnable thin slice (vertical, mock-only).** `db/` Drizzle schema for the core entities + dual-dialect `getDb()` + SQLite migrations + seed (one `local` Server, one admin `User`). `api` skeleton (Fastify) with argon2id login, server-side revocable Session, RBAC middleware, append-only `AuditEvent`. `core` `DomainService` + `QuotaService`. `providers-mock` + `InProcessAgent`. `web` with login + dashboard + **Domains list/create** end-to-end against mocks. **Deliverable: log in on Windows, create a domain, see a generated nginx vhost file appear under `./.lest-dev` — the whole stack runs with zero privilege.**

- **M2 — IPC trust boundary (security spine).** `AgentClient` interface; `SocketAgentClient` + `InProcessAgent`; `lest-agentd` skeleton: unix-socket listener, `SO_PEERCRED` check, HMAC verify + replay window + nonce cache, Zod gate, **ownership re-derivation** against `db/agentView` (read-only), `safeExec` (execFile-only) wrapper, `limits` (rate/concurrency/deadline/kill-switch), typed `AgentError`. **No real handlers yet — prove every rejection path with tests** (peercred, HMAC, replay, validation, ownership mismatch, rate limit).

- **M3 — Multi-tenant model + RBAC + quotas (complete).** Full schema incl. `Subscription` effectiveLimits snapshot, `ReconcileIntent`, reseller subtree; role guards (admin/reseller/customer); recursive reseller-ceiling checks in `QuotaService`; transactional quota enforcement with row locks; reconcile loop in `worker` generating + applying `ReconcileIntent` rows through the (mock) agent.

- **M4 — WebServerProvider (linux).** `rendering/` nginx vhost + php-fpm pool templates with grammar-aware escaping; daemon `webserver.*` handlers: render → temp-write → `nginx -t` → atomic rename + symlink → `systemctl reload nginx` (failed test aborts); systemd-hardened `lest-agentd.service` + `.socket`. First feature live end-to-end on a Linux box.

- **M5 — SystemUserProvider (linux).** Namespaced `useradd -M -s /usr/sbin/nologin` from reserved uid range; home `0750`; disk quota; SFTP via sshd `Match` + `ChrootDirectory` (root:root 0755 + writable subdir); `chpasswd` via stdin. Jail-boundary test.

- **M6 — DatabaseProvider (linux).** MySQL + Postgres admin connections; server-generated namespaced db/user names; parameterized + correctly-quoted DDL; grant templating that refuses `SUPER`/`WITH GRANT OPTION`; size/usage collection in `worker`.

- **M7 — CertProvider + ACME (linux).** `worker` (BullMQ) + `cert.*` verbs; `certbot certonly --webroot` fixed argv; `/.well-known/acme-challenge` REST adapter; renewal scheduler keyed on `Certificate.notAfter` with jitter + per-domain cooldown; issuance modeled as durable `ReconcileIntent` with bounded retry/backoff; ACME staging in dev; reload hooks; expiry metrics + alerting.

- **M8 — React SPA complete.** All pages from §8: customers/plans/subscriptions, domain/db/cert/SFTP management, ReconcileIntent/operations view, audit viewer, account/security. e2e Playwright over the mock stack in CI.

- **M9 — Operations hardening + DR.** `deploy/install.sh` (idempotent) + systemd units (socket-activated, sandboxed, cap-scoped, optional seccomp); secret rotation on deploy (HMAC key, DB admin creds); backup verb + restore runbook (metadata DB dump → replay `ReconcileIntent`s to converge host state); upgrade runbook (drizzle migrate forward + envelope-version negotiation); Prometheus `/metrics` + health/readiness wired; full Linux trust-boundary integration lane in CI.

- **M10 — Threat-model & security review.** Review every `safeExec` call site and every template; confirm no shell metacharacters reach handlers; verify rate-limits on destructive ops; audit append-only DB-level `UPDATE`/`DELETE` revocation; cross-tenant pivot tests; `DnsProvider` left as Noop default. Sign-off gate for v1.

- **M11 (post-v1) — Multi-server enablement.** Add mTLS transport to `AgentClient`; node enrollment flow; placement scheduler picking a `Server` per subscription. **No schema or interface changes required** — this proves the "no corner painted" claim.

---

### Decisive resolutions of inter-proposal conflicts (for the record)
1. **Authorization placement:** ownership is **re-derived inside the daemon** from `subscriptionId` against a read-only DB view (Proposal 1). The web tier's claim is never trusted. *Final.*
2. **Config rendering:** rendered **inside the daemon** from validated structured fields (Proposals 1 & 3). Proposal 2's raw `content: string` vhost command is **rejected**. *Final.*
3. **Build order:** the trust boundary is built and rejection-tested at **M2**, before real handlers (Proposal 1). Proposal 2's build-it-last is **rejected**. *Final.*
4. **Operational layer:** `ReconcileIntent` desired-state model, per-verb rate limits + deadlines + concurrency cap + kill-switch, cap-scoped daemon, `Server`-from-day-one, observability package (Proposal 3) are **adopted**.
5. **DX layer:** shared `contracts/` Zod types driving an in-process mock agent for full Windows parity, frozen `effectiveLimits` snapshot, transactional quota enforcement, the `better-sqlite3` prebuilt-binary caution (Proposal 2) are **adopted** — but tRPC is **replaced by versioned REST** with a typed generated client.
6. **ORM:** **Drizzle** (unanimous). *Final.*
7. **Daemon privilege:** root-launched then dropped to a minimal `AmbientCapabilities` set (Proposal 3), not persistent full root. *Final.*

---

## Appendix A — Implementation deviations (toolchain reality)

These pragmatic deviations were made when implementation started on the actual dev
machine (Windows, Node 24). They preserve the spec's intent; rationale is noted.

1. **Package manager: npm workspaces instead of pnpm + Turborepo.** pnpm/turbo require
   extra global tooling (corepack shims) that is brittle on a stock Windows Node install.
   npm workspaces ship with Node and give the same workspace topology. Dev build/run uses
   `tsx` (no emit step) and per-package `tsc --noEmit` for typechecking, so the build-graph
   ordering Turborepo provided is not needed in dev. (pnpm/turbo can be reintroduced later
   without code changes.)
2. **Dev database: PGlite (embedded WASM PostgreSQL) instead of SQLite.** Drizzle schemas
   are dialect-specific (`pgTable` vs `sqliteTable`), so "one schema for SQLite-dev and
   Postgres-prod" is not actually single-source. PGlite runs an embedded Postgres in pure
   WASM — no native compiler, cross-platform — so dev and prod share ONE `pgTable` schema
   and identical query code. Prod still uses real PostgreSQL via `node-postgres`. This is
   strictly better than the spec's split and removes the `better-sqlite3` native-build risk.
3. **Password hashing: `@node-rs/argon2` (napi prebuilt) instead of `argon2`.** Same
   argon2id algorithm; prebuilt binaries install with no compiler on Windows.
4. **Module resolution: `moduleResolution: bundler` + run-via-`tsx`,** so workspace packages
   are consumed directly from their TypeScript source (`exports` -> `src/index.ts`) with no
   separate build step in development.

Everything else — the two-tier trust boundary, the agent command protocol, ownership
re-derivation, the data model, the provider interfaces, the REST surface, and the
milestone order — follows DESIGN.md as written.
