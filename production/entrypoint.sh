#!/bin/sh
set -eu
# Existing demo disks belong to the previous root runtime. Read the old store
# once without modifying it; keep all new data in a separate owned directory.
if [ -z "${DATABASE_URL:-}" ]; then
  mkdir -p "${DATA_DIR:-/var/data}/native"
  node production/bootstrap-local.mjs
  chown -R node:node "${DATA_DIR:-/var/data}/native"
fi
exec gosu node node production/server.mjs
