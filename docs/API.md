# TukuPay API v1

TukuPay exposes one internal payment contract to every Tuku product while MTN and Airtel remain provider adapters behind the service.

## Authentication

Internal endpoints require:

```http
Authorization: Bearer <TUKUPAY_SERVICE_TOKEN>
```

Never ship the service token in Android, browser, or desktop clients. Product backends call TukuPay server-to-server.

## Create collection

`POST /v1/payments`

Optional header: `Idempotency-Key: <stable request key>`

```json
{
  "product": "kela",
  "externalId": "KELA-ORDER-10487",
  "country": "UG",
  "provider": "mtn",
  "money": { "amount": "68000", "currency": "UGX" },
  "phone": "0772123456",
  "description": "Kela order KELA-ORDER-10487",
  "metadata": { "orderId": "KELA-ORDER-10487" }
}
```

When more than one rail is configured in a country, `provider` is intentionally required. TukuPay does not guess the operator solely from a phone prefix because mobile-number portability can make that unsafe.

## Read payment

`GET /v1/payments/:id`

## Force authoritative status refresh

`POST /v1/payments/:id/refresh`

The provider status endpoint is authoritative. Webhook payloads wake the service up but do not directly mark a payment successful.

## Webhooks

MTN callback URL pattern:

`POST|PUT /webhooks/mtn/UG/:providerReference`

Airtel callback URL pattern:

`POST|PUT /webhooks/airtel/UG`

If Airtel supplies the TukuPay transaction id in its callback, TukuPay resolves and verifies it. Reconciliation polling remains the fallback.

## Reconciliation

A background worker checks unresolved transactions. It can also be invoked manually by an authenticated service:

`POST /internal/reconcile`

```json
{ "limit": 50 }
```

## Accounting behavior

A confirmed collection creates a balanced journal entry:

- Debit: operator collection clearing asset
- Credit: product customer-funds clearing liability

TukuPay deliberately does not recognize product revenue. Each Tuku product or the accounting layer decides how customer funds are allocated after collection.
