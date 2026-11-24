# Dedicated verification runner
Use a disposable development VM or workstation, not the production VPS. No operator or production database credentials are required.

## Prerequisites
Node 22, pinned pnpm 9.15.4, Python 3.13, stable Rust/Cargo, Git, Docker with PostgreSQL 17 image access, curl and psql. Private repository access via authorized Git credentials. Install tools through the organization's approved package sources. Docker privileges are administrative; restrict runner access. Keep evidence private.

## Actions
1. Check out the exact PR head in a clean checkout. Record git rev-parse HEAD. Ensure no production env file or credential is loaded.
2. Run pnpm install --lockfile-only on a reviewed dependency set; review and commit the generated pnpm-lock.yaml separately. Thereafter require pnpm install --frozen-lockfile in CI and runner. Do not fabricate the lockfile.
3. Run scripts/verify-local.sh using its disposable database and loopback API. Capture exit code and restricted logs. No production access. Optional PyMoMo tests require reviewed pinned dependencies in an isolated virtualenv.
4. Run scripts/verify-financial.sh after the API build. Check Rust audit and shared financial vectors.
5. Run the approved dependency, container and secret scanners and retain redacted reports. Resolve failures, including the first actual failing CI step, before repeating.
6. Record exact candidate revision and results. Review financial, security and infrastructure gates with assigned roles. An automated test pass is not release approval.

## Completion
All prerequisites installed; clean checkout and frozen dependency install; complete test and audit results; zero unexplained failures; approved risk and migration decisions. If any command fails, record the error and stop promotion. Do not use production to test the candidate.
