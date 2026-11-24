import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import type { PaymentService } from '../services/payment-service.js';

function provider(value: string): ProviderCode {
  if (value !== 'mtn' && value !== 'airtel') {
    throw new TukuPayError('Unknown webhook provider', 'UNKNOWN_PROVIDER', 404);
  }
  return value;
}

function signature(request: FastifyRequest): string | undefined {
  const value = request.headers['x-callback-signature'] ?? request.headers['x-signature'];
  return Array.isArray(value) ? value[0] : value;
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
  payments: PaymentService,
): Promise<void> {
  const handler = async (request: FastifyRequest, reply: import('fastify').FastifyReply) => {
    const params = request.params as { provider: string; country: string; reference?: string };
    const rail = provider(params.provider.toLowerCase());
    const country = params.country.toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new TukuPayError('Invalid callback market', 'INVALID_MARKET', 400);
    const event = await payments.recordWebhook(
      rail,
      country,
      params.reference,
      request.body ?? {},
      signature(request),
    );

    if (event.eventId) setImmediate(() => {
      void payments.processWebhook(event.eventId, rail, country, event.reference)
        .catch((error) => request.log.error({ err: error }, 'Webhook verification failed'));
    });

    return reply.code(202).send({ accepted: true });
  };

  app.route({ method: ['POST', 'PUT'], url: '/webhooks/:provider/:country/:reference', bodyLimit: 64 * 1024, handler });
  app.route({ method: ['POST', 'PUT'], url: '/webhooks/:provider/:country', bodyLimit: 64 * 1024, handler });
}
