import { parseCreateIntent, parseIdempotencyHeader } from '../utils/create-intent.js';
import { requireUuid } from '../utils/request-validation.js';
import type { FastifyInstance } from 'fastify';
import { requireProductAccess, requireScopes } from '../auth/service-auth.js';
import type { PaymentService } from '../services/payment-service.js';

export async function registerPaymentRoutes(
  app: FastifyInstance,
  payments: PaymentService,
): Promise<void> {
  app.post('/v1/payments', { preHandler: requireScopes('payments:create') }, async (request, reply) => {
    const header = request.headers['idempotency-key'];
    const idempotencyKey = parseIdempotencyHeader(header);
    const input = parseCreateIntent(request.body);
    requireProductAccess(request, input.product);
    const payment = await payments.create(input, idempotencyKey);
    return reply.code(payment.status === 'PENDING' ? 202 : 201).send({ payment });
  });

  app.get('/v1/payments/:id', { preHandler: requireScopes('payments:read') }, async (request) => {
    const id = requireUuid((request.params as { id: string }).id);
    const payment = await payments.getById(id);
    requireProductAccess(request, payment.product);
    return { payment };
  });

  app.post('/v1/payments/:id/refresh', { preHandler: requireScopes('payments:refresh') }, async (request) => {
    const id = requireUuid((request.params as { id: string }).id);
    requireProductAccess(request, (await payments.getById(id)).product);
    return { payment: await payments.refresh(id) };
  });
}
