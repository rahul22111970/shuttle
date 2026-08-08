#!/usr/bin/env bash
# Applies db/migrations/*.sql in filename order against the hosted project,
# once each, recorded in schema_migrations. See CLAUDE.md for why psql-not-Docker.
set -euo pipefail
cd "$(dirname "$0")"
source ./conn.sh

psql "$DB_URL" -qAtX -c "create table if not exists public.schema_migrations (
  filename text primary key, applied_at timestamptz not null default now());
revoke all on table public.schema_migrations from anon, authenticated;"

for f in migrations/*.sql; do
  name=$(basename "$f")
  # :'fn' keeps the filename out of the SQL string; psql only interpolates
  # variables on stdin, not in -c, hence the echo pipes.
  done=$(echo "select 1 from public.schema_migrations where filename = :'fn'" | psql "$DB_URL" -qAtX -v fn="$name")
  if [ "$done" = "1" ]; then echo "skip  $name"; continue; fi
  psql "$DB_URL" -qX -v ON_ERROR_STOP=on -f "$f"
  # ponytail: ledger insert is a separate session; a crash between apply and
  # record leaves the migration applied-but-unrecorded and the rerun fails
  # loudly. Fold both into one psql call when migrations multiply.
  echo "insert into public.schema_migrations (filename) values (:'fn')" | psql "$DB_URL" -qAtX -v fn="$name" >/dev/null
  echo "apply $name"
done
