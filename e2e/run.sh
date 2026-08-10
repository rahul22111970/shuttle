#!/usr/bin/env bash
# Exports the web build with the real env inlined, then runs the browser e2e.
# Local-only, like db/test.sh: CI has no secrets and no browser; this gate
# runs on the machine that builds the slice.
#
# The battery runs against STAGING whenever .env.staging exists — prod and
# its real pilot data are never the test bench. Shell env beats .env.local
# in Expo's loading order, so the export below bakes the staging URL in.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env.staging ] && [ -z "${SHUTTLE_ENV_FILE:-}" ]; then
  export SHUTTLE_ENV_FILE=.env.staging
  export SHUTTLE_SECRETS_FILE=.secrets.staging.env
fi
if [ -n "${SHUTTLE_ENV_FILE:-}" ]; then
  set -a; source "$SHUTTLE_ENV_FILE"; set +a
  # .env.local would silently win over the shell env inside expo export;
  # skip dotenv entirely so the sourced file is the only truth
  export EXPO_NO_DOTENV=1
  echo "battery target: $EXPO_PUBLIC_SUPABASE_URL"
fi
# --clear: Metro caches inlined env values; a stale cache silently bakes
# the previous target's URL into the bundle
npx expo export -p web --clear >/dev/null
if [ -n "${SHUTTLE_ENV_FILE:-}" ]; then
  grep -rqs "${EXPO_PUBLIC_SUPABASE_URL#https://}" dist/_expo/static/js/web/ || {
    echo "export did not bake the battery target URL"; exit 1; }
fi
node e2e/auth-magic-link.mjs
node e2e/onboarding.mjs
node e2e/shell.mjs
node e2e/session-tab.mjs
node e2e/scorer.mjs
node e2e/rounds.mjs
node e2e/ledger.mjs
node e2e/quick-log.mjs
node e2e/bulk-log.mjs
node e2e/me.mjs
node e2e/stats.mjs
node e2e/games.mjs
node e2e/groups.mjs
node e2e/admin.mjs
node e2e/voice.mjs
