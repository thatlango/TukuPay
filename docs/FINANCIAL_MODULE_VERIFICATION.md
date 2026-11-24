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


## Follow-up targeted checks — 24 November 2026
Candidate source commit: 7a35cfd8243ac0f3d03f3c1b10dcde24af26dffa.
GitHub DNS resolution still failed. Python 3.13.5 and Node 22.16.0 available; Cargo, pnpm, Docker unavailable.
The following files were reproduced in an isolated temporary directory and Git blob hashes matched repository blobs.
- treasury.py: 267b135073dfc49e76ce5b5595bc8e64876bda55
- risk.py: 98a454cfa71f09accca31debdc5fb62c16481a6a
- test_treasury_risk.py: 344a45a1a50c445bcbfb5646bbd49d467b984880
- intelligence-report.mjs: aebb4441d5e59f49252e7bcf77c97cd3889b09fd
- intelligence-report.test.mjs: 40fab5f22cdaf1216bf7ea0fc28d983258500d1e

Python targeted test_treasury_risk: 5 passed, zero failures. The imported intelligence.py utility functions were reproduced from the current source excerpt, not the complete blob. This is an isolated component test, not full package verification.
Node --test intelligence-report.test.mjs: 2 passed, zero failures.
Not executed: full Python suite/CLI, actual report file load or workspace browser test, Rust compilation and journal audit, database export, SDK/API typecheck, simulator/PyMoMo, benchmark or production verification. No operator/database connection or financial write made. CI and local scripts extended to cover the new fixtures and dashboard checks.

## Environment and balance checks — follow-up
Source commit fe813a84737672c86a2b659b3f43b2c05ea12250. Local Node 22.16.0, TypeScript transpileModule to ES2022. Six reproduced source files matched Git blob hashes:
- financial-environment.ts 311648a81ca7db2767472afb4ac4c09bbabcca1e
- financial-environment.test.ts f1dbce4af092a5c9d5e9502cc43a7e9e941eb447
- balance-validation.ts affabb8287d883df3d9d3e216e938acd9c8f0782
- balance-validation.test.ts 67888cdab788ebfbb11e4933c58c63d2c63da89f
- money.ts 7274b20ab36028c5fd3e26872b72dd3e2fc6a6e9
- errors.ts bc96773dc3fb8a096c6203ce4e506b10e78b30b5
Executed node --test on both targeted test files: four passed, zero failures (72.6 ms total reported). No actual PostgreSQL connection, migration, API startup, operator calls or full TypeScript typecheck. GitHub DNS unavailable; cargo, pnpm, docker and psql missing. New batch tests are not yet executed. Hosted CI failure run 45369200320 had no step details; cause unconfirmed.

## v1.0 recovery slice — 24 November 2026
Candidate commit e128ff8af0d4dcac63562bde20ae68fc93837b26. Verified actual local Node 22.16.0 and Python 3.13.5. Git clone/ls-remote failed DNS; pnpm, cargo, rustc, Docker and psql absent. Three targeted money tests passed (59.409653 ms total Node test report), zero failures. Used TypeScript transpileModule ES2022 in temporary ESM directory, not full typecheck. Before execution exact source blob hashes matched: errors.ts bc96773dc3fb8a096c6203ce4e506b10e78b30b5; money.ts bf53e59bd42a7dec1967d72d5803e08ff1198e5f; money.test.ts ade982029d54a2b19b2fe4b332b90315560e0227. The Airtel account regression test, expanded shared vectors, Rust, migration, full CI and provider contracts have not been executed here. No financial network requests. The new currency allowlist aligns with the current Rust allowlist, but finance must independently review currency policy before release. All security release gates remain open/blocked. No lockfile was generated.
