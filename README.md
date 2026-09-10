# TukuPay

TukuPay is the shared payment orchestration service for the Tuku estate. It provides one internal API for mobile-money collections, payouts, transaction state, reconciliation, and ledgering while keeping provider credentials out of product applications.

## Initial scope

- MTN MoMo collections and payment-status reconciliation
- Airtel Money provider adapter boundary
- Unified payment intents and provider transactions
- PostgreSQL-backed ledger and audit trail
- Webhook/callback ingestion
- Service-to-service authentication boundary for Tuku Core
- Payout/disbursement controls (next phase)

## Architecture

```text
Tuku products -> TukuPay API -> provider adapters -> MTN MoMo / Airtel Money
                         |
                         +-> PostgreSQL ledger + reconciliation workers
```

Products such as Kela, Units, ImpactOS, Radar, ECITAA and others should never embed operator credentials directly. TukuPay owns provider integration and payment state; Tuku Core owns identity and product entitlements.

## Development

Requirements: Node.js 20+, pnpm 9+, Docker.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

Default local API: `http://localhost:8080`

Health check: `GET /health`

Create payment: `POST /v1/payments`

```json
{
  "product": "kela",
  "externalId": "KELA-ORDER-1001",
  "provider": "mtn",
  "amount": 68000,
  "currency": "UGX",
  "phone": "25677XXXXXXX",
  "description": "Kela order payment"
}
```

## Security

Never commit real provider keys, API users, access tokens, database passwords or Tuku Core service credentials. Production secrets belong in the deployment environment on the VPS.

## Provider notes

MTN MoMo `RequestToPay` is asynchronous. A successful submission returns HTTP 202, then TukuPay records the payment as pending and resolves the final state through callback and status polling. MTN callbacks are not treated as the sole source of truth; reconciliation polling is mandatory.

Airtel endpoints and credentials are deliberately configuration-driven so production integration can be aligned with the exact Uganda application/product credentials issued in the Airtel developer portal.
