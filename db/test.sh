#!/usr/bin/env bash
# Runs every db/tests/*.test.sql against the hosted project. Tests roll
# themselves back; they share one DB, so they run serially by construction.
set -euo pipefail
cd "$(dirname "$0")"
source ./conn.sh

for f in tests/*.test.sql; do
  psql "$DB_URL" -qX -f "$f"
done
