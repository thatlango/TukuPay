import Fastify from 'fastify';
import {
  isOperationConfigured,
  simulatorEnabled,
} from './config/provider-credentials.js';
import { MARKETS } from './config/markets.js';
import { db } from './db/pool.js';
import { TukuPayError } from './errors.js';
import { AirtelMoneyAdapter } from './providers/airtel.js';
import { MtnMoMoAdapter } from './providers/mtn.js';
import { SimulatedProviderAdapter } from './providers/simulator.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerOpsRoutes } from './routes/ops.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerPayoutRoutes } from './routes/payouts.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { OpsService } from './services/ops-service.js';
import { PaymentService } from './services/payment-service.js';
import { PayoutService } from './services/payout-service.js';
import { ProviderRouter } from './services/provider-router.js';
import { ReconciliationService, startReconciliationWorker } from './services/reconciliation.js';
import { SettlementService } from './services/settlement-service.js';

const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });

const realAdapters = [new MtnMoMoAdapter(), new AirtelMoneyAdapter()];
const adapters = simulatorEnabled()
  ? [
      new SimulatedProviderAdapter('mtn'),
      new SimulatedProviderAdapter('airtel'),
      ...realAdapters,
    ]
  : realAdapters;

const router = new ProviderRouter(adapters);
const payments = new PaymentService(router);
const payouts = new PayoutService(router);
const ops = new OpsService(router);
const settlements = new SettlementService();
const reconciliation = new ReconciliationService(payments, payouts);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof TukuPayError) {
    void reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return;
  }
  app.log.error({ err: error }, 'Unhandled TukuPay request error');
  void reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'TukuPay could not complete the request' },
  });
});

app.get('/health', async () => ({
  service: 'tukupay',
  status: 'ok',
  version: '0.3.0',
  simulator: simulatorEnabled(),
}));

app.get('/v1/markets', async () => ({
  markets: Object.values(MARKETS).map((market) => ({
    country: market.country,
    currency: market.currency,
    dialCode: market.dialCode,
    providers: market.providers.map((item) => ({
      provider: item.provider,
      supported: item.enabled,
      mode: simulatorEnabled() ? 'simulator' : 'operator',
      collectionsConfigured: item.enabled
        && isOperationConfigured(item.provider, market.country, 'collection'),
      payoutsConfigured: item.enabled
        && item.provider === 'mtn'
        && isOperationConfigured(item.provider, market.country, 'payout'),
    })),
  })),
}));

await registerPaymentRoutes(app, payments);
await registerPayoutRoutes(app, payouts);
await registerWebhookRoutes(app, payments);
await registerOpsRoutes(app, ops, settlements);
await registerInternalRoutes(app, reconciliation);

const stopReconciliation = startReconciliationWorker(reconciliation, app.log);
app.addHook('onClose', async () => {
  stopReconciliation();
  await db.end();
});

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ port, host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close());
}
