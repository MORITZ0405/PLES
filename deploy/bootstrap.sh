#!/usr/bin/env bash
#
# LEST one-line server bootstrap — run this ON THE UBUNTU SERVER as root, once the
# repo is pushed to a git host:
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/lest/master/deploy/bootstrap.sh \
#     | sudo LEST_REPO=https://github.com/<you>/lest.git bash
#
# It clones (or updates) the repo and runs the installer. Re-runnable.
#
set -euo pipefail

REPO="${LEST_REPO:?set LEST_REPO=https://github.com/<you>/lest.git}"
BRANCH="${LEST_BRANCH:-master}"
DEST="${LEST_SRC_DIR:-/opt/lest-src}"

[ "$(id -u)" -eq 0 ] || { echo "run as root (pipe to 'sudo bash')" >&2; exit 1; }

command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch --quiet origin "$BRANCH"
  git -C "$DEST" reset --hard --quiet "origin/$BRANCH"
else
  rm -rf "$DEST"
  git clone --quiet --branch "$BRANCH" "$REPO" "$DEST"
fi

cd "$DEST"
exec bash deploy/install.sh
