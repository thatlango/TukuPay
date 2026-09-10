import Fastify from 'fastify';
import { MARKETS } from './config/markets.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  service: 'tukupay',
  status: 'ok',
  version: '0.1.0',
}));

app.get('/v1/markets', async () => ({
  markets: Object.values(MARKETS).map((market) => ({
    country: market.country,
    currency: market.currency,
    dialCode: market.dialCode,
    providers: market.providers
      .filter((provider) => provider.enabled)
      .map((provider) => provider.provider),
  })),
}));

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
