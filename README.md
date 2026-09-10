# TukuPay

TukuPay is the direct mobile-money orchestration and ledger service for the Tuku estate. It gives Kela, Units, ImpactOS, ECITAA, LendFlow, Radar, TukuMail and future products one internal payment API while keeping operator-specific logic inside provider adapters.

## Current scope

- Multi-country routing by country + provider + currency + operator account
- MTN MoMo Collections adapter
- Airtel Money Collections adapter
- OAuth/token caching
- Idempotent payment creation
- Durable PostgreSQL payment state
- Webhook ingestion and deduplication
- Provider-authoritative status verification
- Automatic reconciliation polling
- Double-entry collection clearing ledger
- Service-to-service authentication
- Docker build and CI

Uganda is the first active market. Other markets are catalogued but remain disabled in the database until operator onboarding and commercial activation are complete.

## Architecture

```text
Tuku product backend
        |
        v
     TukuPay
        |
   +----+----+
   |         |
 MTN MoMo  Airtel Money
   |         |
   +----+----+
        |
 PostgreSQL ledger
```

Client applications must never call MTN or Airtel directly and must never contain operator credentials or the TukuPay service token.

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
corepack enable
pnpm install
pnpm db:migrate
pnpm dev
```

Health check:

```bash
curl http://localhost:8080/health
```

See `docs/API.md` for the internal API contract and `docs/MULTI_COUNTRY.md` for the market model.

## Provider credentials

Credentials are namespaced per country, for example `MTN_UG_*`, `AIRTEL_UG_*`, `MTN_RW_*` and `AIRTEL_RW_*`. Secrets belong in the deployment environment only; never commit them to GitHub.

## Production boundary

TukuPay is initially designed to collect payments for Tuku-owned products and services. Using it to receive or hold funds on behalf of unrelated third-party merchants can create payment-service/aggregator regulatory obligations and must be treated as a separate product and compliance decision.
