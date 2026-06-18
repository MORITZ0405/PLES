# LEST — Lightweight Easy Server Toolkit

A self-hosted **web hosting control panel for Linux servers**. LEST lets you manage
websites, databases, SSL certificates and hosting customers from one clean web UI —
conceptually in the spirit of classic hosting panels, but an **independent,
clean-room implementation**.

> **Legal note:** LEST is original work. It contains **no Plesk® / cPanel® source code,
> trademarks, branding, screenshots or other proprietary assets**. Only the general
> idea of "a web UI to administer a hosting server" is shared — which is not protectable.
> All code, UI and naming here are our own.

## What LEST manages (v1)

- **Domains & Websites** — create domains/subdomains, generate nginx virtual hosts,
  pick a PHP version per site, set the document root.
- **Databases** — create/drop MySQL/MariaDB and PostgreSQL databases and users.
- **SSL** — issue and auto-renew Let's Encrypt (ACME) certificates per domain.
- **Customers / multi-tenant** — customers → hosting plans → subscriptions → domains,
  with resource limits and roles (admin / reseller / customer).

## Stack

- **Backend:** Node.js + TypeScript
- **Frontend:** React + TypeScript
- **Panel metadata DB:** SQLite in development, PostgreSQL in production
- **Runs on:** Linux (production). Development works on Windows/macOS via a mock
  system-integration layer, so you can build the UI/API without a real server.

## Getting started (development)

Runs fully on Windows / macOS / Linux with **no privileges** — a mock provider layer
stands in for the real Linux daemon, so you can build and use the whole panel locally.

```bash
npm install
npm run db:push     # generate + apply migrations to the embedded PGlite database
npm run db:seed     # seed an admin user + a demo subscription
npm run dev:api     # API  -> http://localhost:4317
npm run dev:web     # web  -> http://localhost:5173   (open this one)
```

Then open **http://localhost:5173** and sign in:

- Email: `admin@lest.local`
- Password: `change-me-admin-0000`

Create a domain and watch LEST write a real nginx vhost under `.lest-dev/etc/nginx/`.

> The Vite dev server binds IPv6 `localhost` — use `http://localhost:5173`, not `127.0.0.1`.

## Status

🟢 **Milestone M1 complete & verified** — login, multi-tenant data model, and the
Domains flow (create a domain → generated nginx vhost + php-fpm pool) work end-to-end
against the mock provider layer, with a React control-panel UI.

Next milestones (see [`DESIGN.md`](DESIGN.md) §10): M2 privileged IPC trust boundary +
`lest-agentd`, M3 full RBAC/quota reconciler, then the real Linux providers for
nginx (M4), system users/SFTP (M5), databases (M6) and Let's Encrypt SSL (M7).
