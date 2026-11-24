#!/usr/bin/env bash
# Independent of hosted CI, no databases, operators or network requests.
set -euo pipefail
cd "$(dirname "$0")/.."
for tool in python3 cargo; do command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 2; }; done
python3 -m unittest discover -s python/intelligence -p 'test_*.py' -v
python3 python/intelligence/cli.py python/intelligence/fixtures/sample.json >/dev/null
cargo test --manifest-path crates/financial-kernel/Cargo.toml --locked --offline
cargo build --manifest-path crates/financial-kernel/Cargo.toml --locked --offline --bin shadow
if [[ -f apps/api/dist/utils/money.js ]]; then
  node scripts/compare-financial-kernel.mjs crates/financial-kernel/target/debug/shadow
else
  echo "TypeScript comparison NOT RUN: build the API with pnpm build first" >&2
  exit 2
fi
echo 'PASS: offline Python, Rust and money parity checks'
