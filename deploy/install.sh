#!/usr/bin/env bash
#
# LEST — Lightweight Easy Server Toolkit
# Production installer for Debian/Ubuntu. Idempotent: safe to re-run.
#
# Usage (as root, from a checkout of the repo):
#   sudo ./deploy/install.sh
#   sudo LEST_PANEL_DOMAIN=panel.example.com ./deploy/install.sh
#
set -euo pipefail

# ── Config (override via environment) ─────────────────────────────────────
LEST_USER="${LEST_USER:-lest}"
LEST_GROUP="${LEST_GROUP:-lest}"
APP_DIR="${LEST_APP_DIR:-/opt/lest}"
CONF_DIR="${LEST_CONF_DIR:-/etc/lest}"
DATA_DIR="${LEST_DATA_DIR:-/var/lib/lest}"
RUN_DIR="${LEST_RUN_DIR:-/run/lest}"
ENV_FILE="$CONF_DIR/lest.env"
PANEL_DOMAIN="${LEST_PANEL_DOMAIN:-_}"
HTTP_PORT="${LEST_HTTP_PORT:-4317}"
NODE_MAJOR="${LEST_NODE_MAJOR:-20}"
PG_DB="${LEST_PG_DB:-lest}"
PG_USER="${LEST_PG_USER:-lest}"
ADMIN_EMAIL="${LEST_ADMIN_EMAIL:-admin@lest.local}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Pretty output ─────────────────────────────────────────────────────────
c_blue=$'\e[36m'; c_green=$'\e[32m'; c_yellow=$'\e[33m'; c_red=$'\e[31m'; c_bold=$'\e[1m'; c_reset=$'\e[0m'
log()  { printf '%s▸ %s%s\n' "$c_blue" "$*" "$c_reset"; }
ok()   { printf '%s  ✓ %s%s\n' "$c_green" "$*" "$c_reset"; }
warn() { printf '%s  ! %s%s\n' "$c_yellow" "$*" "$c_reset"; }
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── Preflight ─────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || die "must run as root (try: sudo $0)"
have apt-get || die "this installer targets Debian/Ubuntu (apt-get not found)"
# shellcheck disable=SC1091
{ [ -r /etc/os-release ] && . /etc/os-release; } || true
log "Installing ${c_bold}LEST${c_reset}${c_blue} on ${PRETTY_NAME:-this host}"
export DEBIAN_FRONTEND=noninteractive

# ── 1. System packages ────────────────────────────────────────────────────
log "Ensuring base packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git rsync openssl >/dev/null
ok "base packages present"

if have node && node -e 'process.exit(parseInt(process.versions.node) >= '"$NODE_MAJOR"' ? 0 : 1)' 2>/dev/null; then
  ok "node $(node -v) present"
else
  log "Installing Node.js ${NODE_MAJOR}.x (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  ok "node $(node -v) installed"
fi

log "Ensuring nginx, postgresql, certbot"
apt-get install -y -qq nginx postgresql certbot >/dev/null
systemctl enable --now postgresql >/dev/null 2>&1 || true
ok "nginx, postgresql, certbot present"

# ── 2. System user + directories ──────────────────────────────────────────
log "Creating system user and directories"
getent group "$LEST_GROUP" >/dev/null || groupadd --system "$LEST_GROUP"
id "$LEST_USER" >/dev/null 2>&1 || \
  useradd --system --gid "$LEST_GROUP" --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$LEST_USER"
install -d -o root        -g "$LEST_GROUP" -m 0755 "$APP_DIR"
install -d -o root        -g "$LEST_GROUP" -m 0750 "$CONF_DIR"
install -d -o "$LEST_USER" -g "$LEST_GROUP" -m 0750 "$DATA_DIR"
install -d -o "$LEST_USER" -g "$LEST_GROUP" -m 0750 "$DATA_DIR/state"
install -d -o root        -g "$LEST_GROUP" -m 0755 /var/www
ok "user '$LEST_USER' and directories ready"

# ── 3. Application code ───────────────────────────────────────────────────
log "Syncing application to $APP_DIR"
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.lest-dev' --exclude 'apps/web/dist' \
  "$SRC_DIR"/ "$APP_DIR"/
chown -R root:"$LEST_GROUP" "$APP_DIR"
ok "code synced"

log "Installing dependencies + building the web UI (this can take a minute)"
( cd "$APP_DIR" && npm ci --no-audit --no-fund >/dev/null 2>&1 )
( cd "$APP_DIR" && npm -w @lest/web run build >/dev/null 2>&1 )
ok "dependencies installed, web built"

# ── 4. PostgreSQL database + role ─────────────────────────────────────────
log "Configuring PostgreSQL"
PG_PASS_FILE="$CONF_DIR/.pgpass.secret"
if [ -f "$PG_PASS_FILE" ]; then PG_PASS="$(cat "$PG_PASS_FILE")"; else PG_PASS="$(openssl rand -hex 24)"; fi
# Send the password via stdin, never as an argv (which would be visible in
# /proc/<pid>/cmdline). PG_PASS is hex, so single-quoting in SQL is safe.
if [ "$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'")" = "1" ]; then
  printf "ALTER ROLE \"%s\" LOGIN PASSWORD '%s';" "$PG_USER" "$PG_PASS" | sudo -u postgres psql -q >/dev/null
else
  printf "CREATE ROLE \"%s\" LOGIN PASSWORD '%s';" "$PG_USER" "$PG_PASS" | sudo -u postgres psql -q >/dev/null
fi
if [ "$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'")" != "1" ]; then
  sudo -u postgres psql -qc "CREATE DATABASE \"$PG_DB\" OWNER \"$PG_USER\";" >/dev/null
fi
( umask 077; printf '%s' "$PG_PASS" > "$PG_PASS_FILE" )
chown root:"$LEST_GROUP" "$PG_PASS_FILE"; chmod 640 "$PG_PASS_FILE"
DATABASE_URL="postgresql://$PG_USER:$PG_PASS@127.0.0.1:5432/$PG_DB"
ok "database '$PG_DB' and role '$PG_USER' ready"

# ── 5. Secrets + env file ─────────────────────────────────────────────────
log "Writing $ENV_FILE"
read_env() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
SESSION_SECRET="$(read_env LEST_SESSION_SECRET)"; [ -n "$SESSION_SECRET" ] || SESSION_SECRET="$(openssl rand -hex 32)"
HMAC_KEY="$(read_env LEST_AGENT_HMAC_KEY)";       [ -n "$HMAC_KEY" ]       || HMAC_KEY="$(openssl rand -hex 32)"
( umask 077; cat > "$ENV_FILE" <<EOF
# LEST runtime config — generated by install.sh. Mode 640 root:$LEST_GROUP.
NODE_ENV=production
# Privileged provisioning (lest-agentd) lands in milestone M2+. Until the agent
# ships, the control plane runs in 'mock' mode so the panel is fully usable.
# Flip to 'agent' once apps/agent exists and lest-agentd.socket is enabled.
LEST_MODE=mock
LEST_HTTP_HOST=127.0.0.1
LEST_HTTP_PORT=$HTTP_PORT
LEST_DEV_DIR=$DATA_DIR/state
DATABASE_URL=$DATABASE_URL
LEST_SESSION_SECRET=$SESSION_SECRET
LEST_COOKIE_SECURE=false
LEST_AGENT_SOCKET=$RUN_DIR/agentd.sock
LEST_AGENT_HMAC_KEY=$HMAC_KEY
EOF
)
chown root:"$LEST_GROUP" "$ENV_FILE"; chmod 640 "$ENV_FILE"
ok "env written"

# ── 6. Migrations + admin seed ────────────────────────────────────────────
log "Applying migrations"
sudo -u "$LEST_USER" bash -c "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR'; npm run db:migrate"
ok "migrations applied"

log "Seeding admin account"
ADMIN_PASS_FILE="$CONF_DIR/.admin.secret"
ADMIN_PASS="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
# Hand the bootstrap admin secret to the seed via a transient root+lest-only file,
# never as an argv — so it can't be read from /proc/<pid>/cmdline during seeding.
SEED_ENV="$(mktemp)"; chown root:"$LEST_GROUP" "$SEED_ENV"; chmod 640 "$SEED_ENV"
printf 'LEST_ADMIN_EMAIL=%s\nLEST_ADMIN_PASSWORD=%s\n' "$ADMIN_EMAIL" "$ADMIN_PASS" > "$SEED_ENV"
SEED_LOG="$(sudo -u "$LEST_USER" bash -c "set -a; . '$ENV_FILE'; . '$SEED_ENV'; set +a; cd '$APP_DIR'; npm run db:seed" 2>&1 || true)"
rm -f "$SEED_ENV"

# Only treat the generated password as authoritative if the seed actually created the
# admin. If it skipped (admin already present), the DB keeps its existing hash — never
# store/print a password the database doesn't have.
if printf '%s' "$SEED_LOG" | grep -q 'seed complete'; then
  ( umask 077; printf '%s' "$ADMIN_PASS" > "$ADMIN_PASS_FILE" )
  chown root:"$LEST_GROUP" "$ADMIN_PASS_FILE"; chmod 600 "$ADMIN_PASS_FILE"
  ADMIN_CREATED=1
  ok "admin '$ADMIN_EMAIL' created"
else
  ADMIN_CREATED=0
  warn "admin already exists — existing password left unchanged"
fi

# ── 7. systemd units ──────────────────────────────────────────────────────
log "Installing systemd units"
for unit in lest-api.service lest-agentd.service lest-agentd.socket lest-worker.service; do
  install -m 0644 "$APP_DIR/deploy/systemd/$unit" "/etc/systemd/system/$unit"
done
printf 'd %s 0750 root %s -\n' "$RUN_DIR" "$LEST_GROUP" > /etc/tmpfiles.d/lest.conf
systemd-tmpfiles --create /etc/tmpfiles.d/lest.conf >/dev/null 2>&1 || true
systemctl daemon-reload

systemctl enable --now lest-api.service >/dev/null 2>&1
ok "lest-api enabled and started"

# Enable the privileged/background tiers only once their code is present.
if [ -f "$APP_DIR/apps/agent/src/server.ts" ]; then
  systemctl enable --now lest-agentd.socket >/dev/null 2>&1 && ok "lest-agentd socket enabled"
else
  warn "lest-agentd not enabled — apps/agent absent (privileged provisioning is milestone M2+)"
fi
if [ -f "$APP_DIR/apps/worker/src/server.ts" ]; then
  systemctl enable --now lest-worker.service >/dev/null 2>&1 && ok "lest-worker enabled"
else
  warn "lest-worker not enabled — apps/worker absent"
fi

# ── 8. nginx panel vhost ──────────────────────────────────────────────────
log "Configuring nginx panel vhost"
sed "s/__PANEL_DOMAIN__/$PANEL_DOMAIN/g" "$APP_DIR/deploy/nginx/lest-panel.conf" \
  > /etc/nginx/sites-available/lest-panel.conf
ln -sf /etc/nginx/sites-available/lest-panel.conf /etc/nginx/sites-enabled/lest-panel.conf
# Remove nginx's stock default site so LEST (default_server) wins for IP/unmatched hosts.
rm -f /etc/nginx/sites-enabled/default
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
  ok "nginx configured"
else
  warn "nginx -t failed; left the previous config active — check 'nginx -t'"
fi

# ── Done ──────────────────────────────────────────────────────────────────
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
URL_HOST="$PANEL_DOMAIN"; [ "$PANEL_DOMAIN" = "_" ] && URL_HOST="${IP:-<server-ip>}"
cat <<EOF

${c_green}${c_bold}LEST is installed.${c_reset}

  Panel URL : http://$URL_HOST/
  Admin     : $ADMIN_EMAIL
EOF
if [ "${ADMIN_CREATED:-0}" = "1" ]; then
  printf '  Password  : stored root-only at %s\n' "$ADMIN_PASS_FILE"
  printf '              read it with: sudo cat %s   (then rotate after first login)\n' "$ADMIN_PASS_FILE"
else
  printf '  Password  : unchanged (admin already existed); see %s if you saved it\n' "$ADMIN_PASS_FILE"
fi
cat <<EOF

  Status    : systemctl status lest-api
  Logs      : journalctl -u lest-api -f
  Config    : $ENV_FILE
  Uninstall : sudo $APP_DIR/deploy/uninstall.sh

${c_red}${c_bold}! SECURITY — do not expose this publicly yet.${c_reset} The panel is served over
plain HTTP and the admin session cookie is NOT marked Secure, so logins (a real
credential, even in preview mode) travel in cleartext. Enable TLS first:
  sudo certbot --nginx -d <your-domain>          # obtain a certificate
  sudoedit $ENV_FILE                              # set LEST_COOKIE_SECURE=true
  sudo systemctl restart lest-api

${c_yellow}Note:${c_reset} privileged provisioning (lest-agentd) is milestone M2+. This deployment
runs the control plane in preview (mock) mode — UI + data model fully usable; real
nginx/database/SSL provisioning activates when the agent ships (LEST_MODE=agent).
EOF
