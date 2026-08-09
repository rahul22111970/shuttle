# Builds DB_URL for the hosted Supabase project. Source this; never echo it.
# Callers cd into db/ first, so .secrets.env is one level up.
# The password contains characters that need url-encoding (see CLAUDE.md).
set -a; source ../"${SHUTTLE_SECRETS:-.secrets.env}"; set +a
_enc=$(python3 -c "import urllib.parse,os;print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'],safe=''))")
DB_URL="postgresql://postgres:${_enc}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require"
