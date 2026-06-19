#!/usr/bin/env bash
#
# LEST one-command remote install — run this from YOUR WORKSTATION (Git Bash / macOS / Linux).
# It packages the repo, copies it to the server over SSH, and runs the installer there.
#
#   bash deploy/remote-install.sh user@server-ip
#   bash deploy/remote-install.sh root@1.2.3.4 panel.example.com
#
# Needs: ssh, scp, tar (all bundled with Git for Windows). SSH-key auth recommended;
# with password auth you'll simply be prompted.
#
set -euo pipefail

TARGET="${1:-}"
DOMAIN="${2:-}"
if [ -z "$TARGET" ]; then
  echo "usage: $0 user@host [panel-domain]" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -t lest-src-XXXXXX.tgz)"
trap 'rm -f "$TMP"' EXIT

echo "→ packaging $HERE"
tar czf "$TMP" -C "$HERE" \
  --exclude=node_modules --exclude=.lest-dev --exclude=.git --exclude='*.tgz' .

echo "→ uploading to $TARGET"
scp -q "$TMP" "$TARGET:/tmp/lest-src.tgz"

echo "→ installing on $TARGET (you may be prompted for the sudo password)"
ssh -t "$TARGET" "set -e
  rm -rf ~/lest-src && mkdir -p ~/lest-src
  tar xzf /tmp/lest-src.tgz -C ~/lest-src && rm -f /tmp/lest-src.tgz
  cd ~/lest-src
  sudo ${DOMAIN:+LEST_PANEL_DOMAIN=$DOMAIN }bash deploy/install.sh"

echo "✓ done — open the panel URL printed above"
