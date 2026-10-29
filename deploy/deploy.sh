#!/usr/bin/env bash
# Deploys a git ref to the VPS from an operator machine.
#   deploy/deploy.sh setup [ref]   first time: prepare the host, then release
#   deploy/deploy.sh [ref]         release only (default ref: HEAD)
#
# Reads, from the environment:
#   DEPLOY_SSH_HOST, DEPLOY_SSH_USER (a sudo user), DEPLOY_SSH_KEY (private key text),
#   TURNOUT_DOMAIN, and for setup the LITESTREAM_S3_ENDPOINT, LITESTREAM_S3_BUCKET,
#   LITESTREAM_S3_REGION, LITESTREAM_S3_ACCESS_KEY_ID, LITESTREAM_S3_SECRET_ACCESS_KEY values.
# Secrets go to the host over stdin, never on a command line.
set -euo pipefail

: "${DEPLOY_SSH_HOST:?}" "${DEPLOY_SSH_USER:?}" "${DEPLOY_SSH_KEY:?}"

mode=release
if [ "${1:-}" = "setup" ]; then mode=setup; shift; fi
ref="${1:-HEAD}"
sha="$(git rev-parse --verify --quiet "$ref^{commit}")" || { echo "Unknown ref: $ref" >&2; exit 1; }

keydir="$(mktemp -d)"
trap 'rm -rf "$keydir"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$keydir/key"
chmod 0600 "$keydir/key"
# accept-new pins the host key on first contact and refuses a changed one after that.
ssh_opts=(-i "$keydir/key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new
  -o UserKnownHostsFile="$HOME/.ssh/known_hosts_turnout" -o ConnectTimeout=15)
remote() { ssh "${ssh_opts[@]}" "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" "$@"; }

if [ "$mode" = setup ]; then
  : "${TURNOUT_DOMAIN:?}" "${LITESTREAM_S3_BUCKET:?}" "${LITESTREAM_S3_ACCESS_KEY_ID:?}" "${LITESTREAM_S3_SECRET_ACCESS_KEY:?}"
  git show "$sha:deploy/setup.sh" | remote "sudo TURNOUT_DOMAIN='$TURNOUT_DOMAIN' bash -s"
  printf 'LITESTREAM_S3_ENDPOINT=%s\nLITESTREAM_S3_BUCKET=%s\nLITESTREAM_S3_REGION=%s\nLITESTREAM_S3_ACCESS_KEY_ID=%s\nLITESTREAM_S3_SECRET_ACCESS_KEY=%s\n' \
    "${LITESTREAM_S3_ENDPOINT:-}" "$LITESTREAM_S3_BUCKET" "${LITESTREAM_S3_REGION:-auto}" \
    "$LITESTREAM_S3_ACCESS_KEY_ID" "$LITESTREAM_S3_SECRET_ACCESS_KEY" |
    remote "sudo install -o root -g turnout -m 0640 /dev/stdin /etc/turnout/litestream.env"
fi

dir="/srv/turnout/releases/$sha"
git archive --format=tar "$sha" |
  remote "sudo rm -rf '$dir' && sudo install -d -o turnout -g turnout '$dir' && sudo tar -x -C '$dir' && sudo chown -R turnout:turnout '$dir'"
remote "sudo bash '$dir/deploy/release.sh' '$sha'"
