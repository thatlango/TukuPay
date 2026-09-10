# TukuPay Multi-Country Foundation

Country is a first-class routing dimension in TukuPay.

Every payment is resolved using:

```text
country + provider + currency + operator account
```

Examples:

```text
UG + MTN + UGX -> MTN Uganda operator account
UG + Airtel + UGX -> Airtel Uganda operator account
RW + MTN + RWF -> MTN Rwanda operator account
RW + Airtel + RWF -> Airtel Rwanda operator account
ZM + MTN + ZMW -> MTN Zambia operator account
ZM + Airtel + ZMW -> Airtel Zambia operator account
```

## Rules

1. Product code never determines the operator account by itself.
2. Credentials are scoped to provider + country.
3. Production activation is independent per operator and country.
4. A country can exist in the catalog while remaining disabled for live Tuku traffic.
5. Provider-specific API behavior lives in adapters; Tuku products call one unified TukuPay API.
6. Currency is validated against the selected market before a provider request is made.
7. Settlement, reconciliation, webhooks, balances, and payouts are tracked per provider market.

## Environment naming

Use country-scoped secrets:

```text
MTN_UG_BASE_URL=
MTN_UG_TARGET_ENVIRONMENT=mtnuganda
MTN_UG_COLLECTION_SUBSCRIPTION_KEY=
MTN_UG_API_USER=
MTN_UG_API_KEY=
MTN_UG_CALLBACK_URL=https://payments.tukutuku.org/webhooks/mtn/UG

AIRTEL_UG_BASE_URL=
AIRTEL_UG_CLIENT_ID=
AIRTEL_UG_CLIENT_SECRET=
AIRTEL_UG_CALLBACK_URL=https://payments.tukutuku.org/webhooks/airtel/UG
```

A second country is added without changing application code:

```text
MTN_RW_BASE_URL=
MTN_RW_TARGET_ENVIRONMENT=mtnrwanda
MTN_RW_COLLECTION_SUBSCRIPTION_KEY=
MTN_RW_API_USER=
MTN_RW_API_KEY=
MTN_RW_CALLBACK_URL=https://payments.tukutuku.org/webhooks/mtn/RW

AIRTEL_RW_BASE_URL=
AIRTEL_RW_CLIENT_ID=
AIRTEL_RW_CLIENT_SECRET=
AIRTEL_RW_CALLBACK_URL=https://payments.tukutuku.org/webhooks/airtel/RW
```

## Commercial activation

Presence in the TukuPay market catalog is not evidence that Tuku has been approved by the operator in that country. A provider market becomes production-enabled only after operator onboarding, credentials, callback registration, settlement setup, and any required local compliance checks are complete.

## Recommended rollout

Start with Uganda as the only production-enabled country. Keep the wider African market catalog available in code/database, then activate countries one at a time as Tuku secures operator accounts.
