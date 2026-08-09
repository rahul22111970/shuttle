#!/usr/bin/env bash
# Runs every db/tests/*.test.sql. Tests roll themselves back; they share one
# DB, so they run serially by construction. They target STAGING whenever its
# secrets file exists — prod is never the test bench.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f ../.secrets.staging.env ]; then
  SHUTTLE_SECRETS="${SHUTTLE_SECRETS:-.secrets.staging.env}"
  export SHUTTLE_SECRETS
fi
source ./conn.sh

for f in tests/*.test.sql; do
  psql "$DB_URL" -qX -f "$f"
done
