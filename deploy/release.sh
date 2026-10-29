#!/usr/bin/env bash
# Runs on the host as root, from the release directory deploy.sh unpacked:
#   bash /srv/turnout/releases/<sha>/deploy/release.sh <sha>
# Installs dependencies, installs the units and configs from this release, points
# /srv/turnout/current at it, restarts, and checks health. On a failed check it points
# current back at the previous release and restarts again.
set -euo pipefail

sha="$1"
dir="/srv/turnout/releases/$sha"
cd "$dir"

# The server workspace and the contract only; --ignore-scripts skips lefthook and app tooling.
sudo -u turnout HOME=/srv/turnout /usr/local/bin/bun install --frozen-lockfile --ignore-scripts \
  --filter hydsocial-communitie-sync --filter @turnout/contract
chmod 0755 deploy/*.sh

install -m 0644 deploy/turnout@.service deploy/turnout-admin.service deploy/turnout-sync.service \
  deploy/turnout-sync.timer /etc/systemd/system/
install -m 0644 deploy/litestream.yml /etc/litestream.yml
install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

previous="$(readlink -f /srv/turnout/current 2>/dev/null || true)"
ln -sfn "$dir" /srv/turnout/current.new && mv -T /srv/turnout/current.new /srv/turnout/current

# Production starts only once its env file has the required values; until then staging runs alone.
units=(turnout@staging)
if grep -q '^GRIEVANCE_NAME=.' /etc/turnout/production.env; then
  units+=(turnout@production turnout-admin)
fi

healthy() {
  local port
  for unit in "${units[@]}"; do
    case "$unit" in
      turnout@staging) port=3002 ;;
      turnout@production) port=3000 ;;
      *) continue ;;
    esac
    timeout 90 bash -c "until curl -sf http://127.0.0.1:$port/api/app/v1/health >/dev/null; do sleep 1; done" || {
      echo "Health check failed for $unit" >&2
      journalctl -u "$unit" -n 30 --no-pager >&2
      return 1
    }
  done
}

systemctl enable --now caddy >/dev/null
systemctl reload caddy
systemctl enable "${units[@]}" >/dev/null
systemctl restart "${units[@]}"
if ! healthy; then
  if [ -n "$previous" ] && [ "$previous" != "$dir" ]; then
    echo "Rolling back to $previous" >&2
    ln -sfn "$previous" /srv/turnout/current.new && mv -T /srv/turnout/current.new /srv/turnout/current
    systemctl restart "${units[@]}"
  fi
  exit 1
fi

if [[ " ${units[*]} " == *" turnout@production "* ]]; then
  [ -e /etc/turnout/litestream.env ] && systemctl enable --now litestream >/dev/null && systemctl restart litestream
  systemctl enable --now turnout-sync.timer >/dev/null
fi

# Keep the five newest releases.
ls -1dt /srv/turnout/releases/*/ | tail -n +6 | xargs -r rm -rf
echo "Released $sha: ${units[*]}"
