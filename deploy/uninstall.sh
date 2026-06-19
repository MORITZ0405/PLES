#!/usr/bin/env bash
#
# LEST uninstaller. Removes services + nginx vhost.
# With --purge it also drops the database, role, system user and all data.
#
#   sudo ./deploy/uninstall.sh           # remove services, keep data
#   sudo ./deploy/uninstall.sh --purge   # remove everything
#
set -euo pipefail

LEST_USER="${LEST_USER:-lest}"
LEST_GROUP="${LEST_GROUP:-lest}"
APP_DIR="${LEST_APP_DIR:-/opt/lest}"
CONF_DIR="${LEST_CONF_DIR:-/etc/lest}"
DATA_DIR="${LEST_DATA_DIR:-/var/lib/lest}"
RUN_DIR="${LEST_RUN_DIR:-/run/lest}"
PG_DB="${LEST_PG_DB:-lest}"
PG_USER="${LEST_PG_USER:-lest}"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

c_blue=$'\e[36m'; c_green=$'\e[32m'; c_red=$'\e[31m'; c_reset=$'\e[0m'
log() { printf '%s▸ %s%s\n' "$c_blue" "$*" "$c_reset"; }
ok()  { printf '%s  ✓ %s%s\n' "$c_green" "$*" "$c_reset"; }
die() { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (try: sudo $0)"

log "Stopping and disabling services"
for unit in lest-api.service lest-agentd.socket lest-agentd.service lest-worker.service; do
  systemctl disable --now "$unit" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$unit"
done
systemctl daemon-reload
rm -f /etc/tmpfiles.d/lest.conf
ok "services removed"

log "Removing nginx vhost"
rm -f /etc/nginx/sites-enabled/lest-panel.conf /etc/nginx/sites-available/lest-panel.conf
nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
ok "nginx vhost removed"

if [ "$PURGE" -eq 1 ]; then
  log "Purging database, user and data"
  sudo -u postgres psql -qc "DROP DATABASE IF EXISTS \"$PG_DB\";" >/dev/null 2>&1 || true
  sudo -u postgres psql -qc "DROP ROLE IF EXISTS \"$PG_USER\";" >/dev/null 2>&1 || true
  id "$LEST_USER" >/dev/null 2>&1 && userdel "$LEST_USER" >/dev/null 2>&1 || true
  getent group "$LEST_GROUP" >/dev/null 2>&1 && groupdel "$LEST_GROUP" >/dev/null 2>&1 || true
  rm -rf "$APP_DIR" "$CONF_DIR" "$DATA_DIR" "$RUN_DIR"
  ok "purged"
else
  printf '%sKept:%s database, %s, %s (re-run with --purge to remove)\n' \
    "$c_green" "$c_reset" "$DATA_DIR" "$CONF_DIR"
fi

printf '\n%sLEST uninstalled.%s\n' "$c_green" "$c_reset"
