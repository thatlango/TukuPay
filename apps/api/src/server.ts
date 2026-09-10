import Fastify from 'fastify';
import { isOperatorConfigured } from './config/provider-credentials.js';
import { MARKETS } from './config/markets.js';
import { db } from './db/pool.js';
import { TukuPayError } from './errors.js';
import { AirtelMoneyAdapter } from './providers/airtel.js';
import { MtnMoMoAdapter } from './providers/mtn.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { PaymentService } from './services/payment-service.js';
import { ProviderRouter } from './services/provider-router.js';
import { ReconciliationService, startReconciliationWorker } from './services/reconciliation.js';

const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });
const router = new ProviderRouter([new MtnMoMoAdapter(), new AirtelMoneyAdapter()]);
const payments = new PaymentService(router);
const reconciliation = new ReconciliationService(payments);

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
  version: '0.2.0',
}));

app.get('/v1/markets', async () => ({
  markets: Object.values(MARKETS).map((market) => ({
    country: market.country,
    currency: market.currency,
    dialCode: market.dialCode,
    providers: market.providers.map((item) => ({
      provider: item.provider,
      supported: item.enabled,
      configured: item.enabled && isOperatorConfigured(item.provider, market.country),
    })),
  })),
}));

await registerPaymentRoutes(app, payments);
await registerWebhookRoutes(app, payments);
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
