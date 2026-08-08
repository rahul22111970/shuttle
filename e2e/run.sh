#!/usr/bin/env bash
# Exports the web build with the real env inlined, then runs the browser e2e
# against the hosted Supabase project. Local-only, like db/test.sh: CI has no
# secrets and no browser; this gate runs on the machine that builds the slice.
set -euo pipefail
cd "$(dirname "$0")/.."
npx expo export -p web >/dev/null
node e2e/auth-magic-link.mjs
node e2e/onboarding.mjs
node e2e/shell.mjs
node e2e/session-tab.mjs
node e2e/scorer.mjs
node e2e/rounds.mjs
node e2e/ledger.mjs
node e2e/today.mjs
