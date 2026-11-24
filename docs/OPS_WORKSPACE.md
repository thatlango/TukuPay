# TukuPay operations workspace
This is a local, server-rendered operator workspace, not a deployed multi-user product.
Prerequisites: Node 22, a built SDK, a reachable TukuPay API with migrations through 006 applied, and a dedicated operator service identity. Grant ops:read for views; add ops:manage only for authorized exception reviewers. Do not use a wildcard administrator credential.

1. Run pnpm build from repository root.
2. Supply TUKUPAY_OPS_API_URL and TUKUPAY_OPS_TOKEN using your approved local secret-injection method. Do not put the credential into a URL or browser.
3. Run node scripts/ops-workspace.mjs.
4. Open http://127.0.0.1:8787 on the same trusted workstation.
5. Review the provider capabilities, per-currency activity, exceptions and transport counters. Assign or change a review state with a non-sensitive note. A concurrent edit returns conflict; reload and review before resubmitting.
6. Stop the process when finished.

The credential stays in the Node process. The listener is loopback only; do not expose it through a reverse proxy or tunnel. All users with access to this workstation share the workspace service identity. For multi-user deployment, integrate Tuku Core human identity, session authorization, RBAC and audit attribution first. The workspace cannot initiate or approve payouts, refresh transactions, or change financial status. REVIEWED means the operator reviewed the exception, not that settlement succeeded.
Completion: all four read panels load, a permitted review updates its version, unauthorized or stale edits fail, and the underlying financial state is unchanged. Verify only against simulator before release. Do not enter customer details or credentials in review notes.
