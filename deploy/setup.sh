#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 VPS for Turnout. Run as root; safe to run again.
#   TURNOUT_DOMAIN=example.com bash deploy/setup.sh
# deploy/deploy.sh runs it over SSH. It installs pinned Bun and Litestream, Caddy from its
# apt repository, the turnout user, the directories, the firewall and the env files. It never
# overwrites an env file that exists, so values set by hand survive a re-run.
set -euo pipefail

BUN_VERSION=1.4.3
LITESTREAM_VERSION=0.5.17
: "${TURNOUT_DOMAIN:?set TURNOUT_DOMAIN}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq curl unzip ufw debian-keyring debian-archive-keyring apt-transport-https gnupg sqlite3

case "$(uname -m)" in
  x86_64) bun_arch=x64 ls_arch=x86_64 ;;
  aarch64) bun_arch=aarch64 ls_arch=arm64 ;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Bun, checked against the release's SHASUMS256.txt.
if [ "$(/usr/local/bin/bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  base="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}"
  curl -fsSL -o "$work/bun.zip" "$base/bun-linux-${bun_arch}.zip"
  curl -fsSL -o "$work/SHASUMS256.txt" "$base/SHASUMS256.txt"
  (cd "$work" && grep " bun-linux-${bun_arch}.zip\$" SHASUMS256.txt | sed "s/bun-linux-${bun_arch}.zip/bun.zip/" | sha256sum -c -)
  unzip -qo "$work/bun.zip" -d "$work"
  install -m 0755 "$work/bun-linux-${bun_arch}/bun" /usr/local/bin/bun
fi

# Litestream, checked against the release's checksums.txt.
if ! litestream version 2>/dev/null | grep -q "$LITESTREAM_VERSION"; then
  deb="litestream-${LITESTREAM_VERSION}-linux-${ls_arch}.deb"
  base="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}"
  curl -fsSL -o "$work/$deb" "$base/$deb"
  curl -fsSL -o "$work/checksums.txt" "$base/checksums.txt"
  (cd "$work" && grep " ${deb}\$" checksums.txt | sha256sum -c -)
  dpkg -i "$work/$deb"
fi

# Caddy, from its own apt repository (https://caddyserver.com/docs/install).
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi

id turnout >/dev/null 2>&1 || useradd --system --home /srv/turnout --shell /usr/sbin/nologin turnout
install -d -o turnout -g turnout -m 0750 /srv/turnout /srv/turnout/releases /data
install -d -o root -g turnout -m 0750 /etc/turnout

# Only SSH and the web ports. The app and the admin listen behind Caddy or on loopback.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# Generate the secrets on the host, once. Values are never copied between environments.
secret() { head -c 32 /dev/urandom | base64 | tr -d '/+=' ; }
jwt_pair() {
  openssl ecparam -name prime256v1 -genkey -noout -out "$work/ec.pem"
  local private public
  private="$(openssl pkcs8 -topk8 -nocrypt -in "$work/ec.pem" | awk 'BEGIN{ORS="\\n"} {print}')"
  public="$(openssl ec -in "$work/ec.pem" -pubout 2>/dev/null | awk 'BEGIN{ORS="\\n"} {print}')"
  rm -f "$work/ec.pem"
  printf 'AUTH_JWT_PRIVATE_KEY="%s"\nAUTH_JWT_PUBLIC_KEY="%s"\n' "$private" "$public"
}
write_env() {
  local name="$1" port="$2" extra="$3" file="/etc/turnout/$1.env"
  [ -e "$file" ] && return 0
  umask 027
  {
    echo "# Written by deploy/setup.sh. Edit by hand; a re-run keeps this file."
    echo "TURNOUT_ENV=$name"
    echo "TURNOUT_PORT=$port"
    echo "DB_PATH=/data/$name.db"
    echo "FILES_DIR=/data/$name-files"
    echo "TRUST_PROXY_HEADER=x-forwarded-for"
    echo "OTP_PEPPER=$(secret)"
    echo "BAN_PEPPER=$(secret)"
    echo "FILE_LINK_SECRET=$(secret)"
    jwt_pair
    printf '%b' "$extra"
  } > "$file"
  chown root:turnout "$file"
  chmod 0640 "$file"
}
write_env staging 3002 "STAGING_TEST_TOKEN=$(secret)$(secret)\nAPP_LINKS_HOST=staging.${TURNOUT_DOMAIN}\n"
# Production refuses to start until the GRIEVANCE_*, WHATSAPP_* and REVIEWER_* values are added
# (docs/deploy.md). That is on purpose: staging goes first.
write_env production 3000 "OTP_SENDER=whatsapp\nPUSH_SENDER=expo\nAPP_LINKS_HOST=go.${TURNOUT_DOMAIN}\n# Add: GRIEVANCE_*, SUPPORT_EMAIL, WHATSAPP_*, REVIEWER_PHONE, REVIEWER_OTP, APP_LINKS_ANDROID_*, PLAY_STORE_URL\n"

# Caddy reads the domain from its own env file.
install -d /etc/systemd/system/caddy.service.d
printf 'TURNOUT_DOMAIN=%s\n' "$TURNOUT_DOMAIN" > /etc/caddy/turnout.env
printf '[Service]\nEnvironmentFile=/etc/caddy/turnout.env\n' > /etc/systemd/system/caddy.service.d/turnout.conf

# Litestream reads the S3 values from litestream.env (uploaded by deploy.sh) and starts after
# the production app, which restores the database first when it is missing.
install -d /etc/systemd/system/litestream.service.d
printf '[Unit]\nAfter=turnout@production.service\n[Service]\nEnvironmentFile=/etc/turnout/litestream.env\n' \
  > /etc/systemd/system/litestream.service.d/turnout.conf

systemctl daemon-reload
echo "Setup done for ${TURNOUT_DOMAIN}."
