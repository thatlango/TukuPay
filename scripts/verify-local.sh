#!/usr/bin/env bash
# Run from a local checkout; never targets an existing database or operator.
set -euo pipefail
cd "$(dirname "$0")/.."
for tool in node pnpm docker curl; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 2; }
done
if [[ "${1:-}" != "" && "${1:-}" != "--pymomo" ]]; then
  echo "Usage: bash scripts/verify-local.sh [--pymomo]" >&2
  exit 2
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  echo "Node 22 or later is required" >&2; exit 2
fi
run_dir="$(mktemp -d)"
db_id=""
api_pid=""
cleanup() {
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  if [[ -n "$db_id" ]]; then docker rm -f "$db_id" >/dev/null 2>&1 || true; fi
  rm -rf "$run_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
random_value() { node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))'; }
db_password="$(random_value)"
admin="$(random_value)"
product="$(random_value)"
registry="$(node -e 'process.stdout.write(JSON.stringify({kela:{token:process.argv[1],scopes:["payments:create","payments:read","payments:refresh"]}}))' "$product")"
echo "Typecheck, unit tests, and build"
env -i PATH="$PATH" HOME="$HOME" pnpm typecheck
env -i PATH="$PATH" HOME="$HOME" pnpm test
env -i PATH="$PATH" HOME="$HOME" pnpm build

echo "Starting disposable PostgreSQL"
db_id="$(docker run --rm -d -p 127.0.0.1::5432 \
  -e POSTGRES_USER=tukupay -e POSTGRES_DB=tukupay -e POSTGRES_PASSWORD="$db_password" postgres:17-alpine)"
db_port="$(docker port "$db_id" 5432/tcp | awk -F: '$1 == "127.0.0.1" {print $2}')"
[[ "$db_port" =~ ^[0-9]+$ ]] || { echo "No loopback database port" >&2; exit 1; }
ready=false
for _ in $(seq 1 60); do
  if docker exec "$db_id" pg_isready -h 127.0.0.1 -U tukupay -d tukupay >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo "PostgreSQL readiness failed" >&2; exit 1; }
db_url="postgres://tukupay:$db_password@127.0.0.1:$db_port/tukupay"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$db_url" pnpm db:migrate
api_port="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
echo "Starting isolated simulator API"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$db_url" HOST=127.0.0.1 PORT="$api_port" \
  TUKUPAY_SIMULATOR_ENABLED=true TUKUPAY_LIVE_PAYOUTS_ENABLED=false RECONCILIATION_ENABLED=false \
  TUKUPAY_SERVICE_TOKEN="$admin" TUKUPAY_SERVICE_TOKENS_JSON="$registry" \
  node apps/api/dist/server.js > "$run_dir/api.log" 2>&1 &
api_pid=$!
ready=false
for _ in $(seq 1 40); do
  if ! kill -0 "$api_pid" 2>/dev/null; then cat "$run_dir/api.log"; exit 1; fi
  if curl --noproxy '*' -fsS "http://127.0.0.1:$api_port/health" > "$run_dir/health.json" 2>/dev/null; then
    if node -e 'const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); if(p.service!=="tukupay"||p.simulator!==true)process.exit(1)' "$run_dir/health.json"; then
      ready=true; break
    fi
  fi
  sleep 1
done
[[ "$ready" == true ]] || { cat "$run_dir/api.log"; exit 1; }
env -i PATH="$PATH" HOME="$HOME" TUKUPAY_E2E_URL="http://127.0.0.1:$api_port" \
  TUKUPAY_SERVICE_TOKEN="$admin" TUKUPAY_E2E_KELA_TOKEN="$product" node apps/api/scripts/e2e-simulator.mjs
docker exec -i "$db_id" psql -X -qAt -v ON_ERROR_STOP=1 -U tukupay -d tukupay \
  < database/checks/payment_integrity.sql > "$run_dir/integrity.txt"
if [[ -s "$run_dir/integrity.txt" ]]; then cat "$run_dir/integrity.txt"; exit 1; fi
if [[ "${1:-}" == "--pymomo" ]]; then
  test -x .venv-pymomo/bin/python || { echo "Install reviewed pinned PyMoMo dependencies in .venv-pymomo first" >&2; exit 2; }
  env -i PATH="$PATH" HOME="$HOME" .venv-pymomo/bin/python apps/api/scripts/contract-pymomo.py
else
  echo "PyMoMo contract checks NOT RUN (use --pymomo)"
fi
echo "PASS: typecheck, unit tests, build, migrations, simulator E2E and financial integrity audit."
git rev-parse HEAD
