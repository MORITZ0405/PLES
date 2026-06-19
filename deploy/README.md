# Deploying LEST

Two ways to bring LEST up.

## Local development (any OS)

From the repo root:

```bash
npm run setup     # install deps, migrate, seed admin + demo data
npm run dev       # start API + web together
```

Open http://localhost:5173 and sign in with the seeded admin (printed by the seed).

## Production (Debian / Ubuntu)

Run the installer **as root from a checkout of the repo**:

```bash
sudo ./deploy/install.sh
# or with a domain for the panel:
sudo LEST_PANEL_DOMAIN=panel.example.com ./deploy/install.sh
```

What it does (idempotent — safe to re-run):

1. Installs Node.js, nginx, PostgreSQL and certbot (apt).
2. Creates the unprivileged `lest` system user and the directory layout
   (`/opt/lest` code, `/etc/lest` config, `/var/lib/lest` data, `/run/lest` socket).
3. Syncs the app, installs dependencies, builds the web UI.
4. Creates the PostgreSQL role + database with a generated password.
5. Generates secrets and writes `/etc/lest/lest.env` (mode `640 root:lest`).
6. Applies migrations and seeds an admin user (random password saved root-only to
   `/etc/lest/.admin.secret`; read it with `sudo cat`, then rotate).
7. Installs systemd units and an nginx vhost for the panel (and removes nginx's stock
   default site so the panel answers on the server IP).

### Configuration knobs (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `LEST_PANEL_DOMAIN` | `_` | Panel hostname for the nginx vhost |
| `LEST_APP_DIR` | `/opt/lest` | Install location |
| `LEST_HTTP_PORT` | `4317` | Internal API port (behind nginx) |
| `LEST_NODE_MAJOR` | `20` | Node.js major version to install |
| `LEST_ADMIN_EMAIL` | `admin@lest.local` | Seeded admin email |

### Current capability

Privileged provisioning runs through the `lest-agentd` daemon, which is milestone
**M2+**. Until it ships, the installer brings up the control plane in **preview
(`mock`) mode** — the UI, auth and multi-tenant data model are fully usable, and the
installer auto-enables the `lest-agentd` socket + `lest-worker` the moment `apps/agent`
and `apps/worker` are present in the tree. To go live with real provisioning later:

```bash
sudo ./deploy/install.sh                     # re-run; enables agent/worker when present
sudoedit /etc/lest/lest.env                  # set LEST_MODE=agent
sudo systemctl restart lest-api lest-worker
```

### TLS

```bash
sudo certbot --nginx -d panel.example.com
sudoedit /etc/lest/lest.env                  # set LEST_COOKIE_SECURE=true
sudo systemctl restart lest-api
```

### Uninstall

```bash
sudo ./deploy/uninstall.sh            # remove services + nginx vhost, keep data
sudo ./deploy/uninstall.sh --purge    # also drop the database, user and all data
```
