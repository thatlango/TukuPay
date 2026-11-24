#!/usr/bin/env bash
# Read-only preflight; never installs packages or contacts a financial provider.
set -euo pipefail
cd "$(dirname "$0")/.."
missing=0
for command in git node pnpm python3 cargo rustc docker curl psql; do
  if command -v "$command" >/dev/null 2>&1; then printf 'AVAILABLE %s\n' "$command"; else printf 'MISSING %s\n' "$command"; missing=1; fi
done
if command -v node >/dev/null 2>&1; then
  if ! node -e 'process.exit(Number(process.versions.node.split(".")[0])===22?0:1)'; then echo 'REQUIRED Node 22'; missing=1; fi
fi
if command -v pnpm >/dev/null 2>&1; then
  if [[ "$(pnpm --version)" != '9.15.4' ]]; then echo 'REQUIRED pnpm 9.15.4'; missing=1; fi
fi
if [[ ! -f pnpm-lock.yaml ]]; then echo 'MISSING reviewed dependency lockfile'; missing=1; fi
if [[ "$missing" != 0 ]]; then echo 'BLOCKED: verification prerequisites incomplete'; exit 2; fi
echo 'Prerequisites available; full verification has NOT been run.'
