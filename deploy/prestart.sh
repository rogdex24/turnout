#!/usr/bin/env bash
# Runs before each turnout@<env> start (ExecStartPre). For production, restore the database
# from the Litestream replica when the file is missing. litestream.service starts after
# turnout@production, so the restore never races the replication.
set -euo pipefail

instance="$1"
mkdir -p "$(dirname "$DB_PATH")" "$FILES_DIR"
if [ "$instance" = "production" ] && [ ! -e "$DB_PATH" ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/turnout/litestream.env
  set +a
  # -if-replica-exists: a first boot with an empty bucket starts with a new database.
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$DB_PATH"
fi
