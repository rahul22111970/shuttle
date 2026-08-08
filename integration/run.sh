#!/usr/bin/env bash
# Runs integration tests against the hosted project with the real env.
# Local-only, like db/test.sh and e2e/run.sh: CI has no secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; source .secrets.env; INTEGRATION=1; set +a
# --runInBand: shared hosted project, serial by doctrine (CLAUDE.md); a
# parallel first run flaked, exact contention unproven and not worth chasing
npx jest --runInBand --testMatch '**/*.itest.ts'
