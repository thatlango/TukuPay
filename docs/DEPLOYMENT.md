# TukuPay production deployment

Canonical VPS paths:

- application: `/opt/tuku/apps/tukupay`
- secrets: `/opt/tuku/secrets/tukupay.env`
- edge proxy: `/opt/tuku/platform/edge/Caddyfile`
- public endpoint: `https://payments.tukutuku.org`

## Isolation

TukuPay uses its own PostgreSQL volume and private Docker network. Only the API joins the estate `tuku-edge` network. PostgreSQL publishes no host port.

## Secret file

The production secret file must be root-readable only (`0600`) and is never committed. It contains the PostgreSQL bootstrap variables, `DATABASE_URL`, a high-entropy TukuPay service token, and operator credentials when issued.

Operator credentials should be added one country at a time using names such as `MTN_UG_*` and `AIRTEL_UG_*`. Do not enable real-money credentials until the corresponding `provider_markets` production row has been explicitly activated.

## Deploy

```bash
cd /opt/tuku/apps/tukupay
git pull --ff-only
docker compose -f compose.prod.yml build
docker compose -f compose.prod.yml up -d
```

The one-shot `migrate` service waits for PostgreSQL, applies unapplied migrations, then exits successfully before the API starts.

## Health

```bash
docker inspect tukupay-api --format '{{.State.Health.Status}}'
docker exec tuku-edge wget -qO- http://tukupay-api:8080/health
```

## Public edge

Caddy should reverse proxy `payments.tukutuku.org` to `tukupay-api:8080`. TLS is terminated at Caddy. The operator callback URLs remain HTTPS public URLs.

## Backups

Back up the named volume/database as part of the estate database backup cycle before enabling live collections. Payment data and ledger history should use a stricter retention policy than ordinary product cache/data.
