# Financial environment isolation
One database per financial environment: simulator, operator sandbox, production. Each uses distinct database roles/credentials and storage; never reuse a database or volume between environments. The migration adds an empty immutable binding. Server startup requires an explicit matching environment, and operator credential mode must match. The binding cannot be updated/deleted/truncated by ordinary SQL; privileged database owners still have administrative control. The binding is a deployment guard, not a replacement for access controls.

## New empty database only
1. Provision separate storage and least-privilege database access.
2. Apply migrations using the migration role.
3. Run database/checks/bind_empty_environment.sql via psql with the intended environment variable. It refuses a nonempty or previously bound database. Do not run against existing financial data.
4. Set TUKUPAY_FINANCIAL_ENVIRONMENT and compatible simulator/operator flags. Use only credentials for that environment.
5. Start the API. Verify health reports the intended environment and the mismatch tests fail startup.
6. Run simulator integration and read-only ledger audits before deployment.

## Existing database
Do not infer environment from the current configuration or relabel existing records. A mixed or nonempty legacy database requires a separately approved migration, provenance review, reconciliation, backup/restore verification and finance sign-off. Until then, leave it unbound and do not deploy this branch. No existing databases were altered in this change.

Use a separate production database role with no DDL privileges and no write privileges on the binding. Do not share migration/admin credentials with the API. Operator URL, account onboarding and certificate verification remain independent release gates. A matching label does not prove credentials or records are genuine. Current provider_market sandbox rows remain compatible with the simulator only inside the dedicated simulator database.
