# Financial modules — verification evidence

Candidate source commit: b5003cf593d6c59dd81952449169817b719bcb32.

## Executed checks
Local isolated execution, 24 November 2026. Repository checkout was unavailable (GitHub DNS resolution failed). Source files were recreated in a temporary directory and their Git blob hashes matched the connector-returned hashes before execution. No database or operator connection was made.

Python 3.13.5: `python3 -m unittest -v` in the isolated intelligence directory.
- 8 tests passed, 0 failures (0.002 s reported).
- intelligence.py: ddf7b4b69786eef25233d5fa80e9d7c7a0fe8358
- test_intelligence.py: 762e4a0df7309017320404499b42193c524898e8

Node v22.16.0: selected TypeScript files transpiled to ES2022 JavaScript with the locally installed TypeScript compiler's transpileModule, then `node --test apps/api/src/services/financial-vectors.test.js`.
- 2 test groups passed (11 money and 6 payout-limit vectors); 0 failures.
- financial-vectors.test.ts: 145b8528c4142e250e828ccb7058743d95739bb6
- money.ts: 7274b20ab36028c5fd3e26872b72dd3e2fc6a6e9
- errors.ts: bc96773dc3fb8a096c6203ce4e506b10e78b30b5
- payout-limits.ts: b03458ff3b588b4390295937839dbf48642cf94f
- money.tsv: 5aaf5d2678cf111af920cf2dc79df72ecebb146a
- limits.tsv: 4f5038d31c6b790ebc6e4495a566b2146d596fd7

## Not executed
Rust compilation, Rust unit tests, Rust/TypeScript shadow comparison, Python CLI end-to-end, database snapshot export, full workspace typecheck/build, simulator/PyMoMo integration, benchmarks, and operator certification. Rust/Cargo, pnpm and Docker were unavailable in the local environment.

These results verify the identified source blobs only. They are not full PR or production verification. The CI financial-modules job and scripts/verify-financial.sh are provided for repeatable execution on an equipped host.
