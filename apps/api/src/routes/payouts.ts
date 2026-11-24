import { parseCreateIntent, parseIdempotencyHeader } from '../utils/create-intent.js';
import { requireUuid } from '../utils/request-validation.js';
import type { FastifyInstance } from 'fastify';
import { identifyService, requireProductAccess, requireScopes } from '../auth/service-auth.js';
import type { PayoutService } from '../services/payout-service.js';

export async function registerPayoutRoutes(
  app: FastifyInstance,
  payouts: PayoutService,
): Promise<void> {
  app.post('/v1/payouts', { preHandler: requireScopes('payouts:create') }, async (request, reply) => {
    const header = request.headers['idempotency-key'];
    const key = parseIdempotencyHeader(header);
    const input = parseCreateIntent(request.body);
    requireProductAccess(request, input.product);
    const payout = await payouts.create(input, key, identifyService(request)?.service);
    return reply.code(201).send({ payout });
  });

  app.get('/v1/payouts/:id', { preHandler: requireScopes('payouts:read') }, async (request) => {
    const id = requireUuid((request.params as { id: string }).id);
    const payout = await payouts.getById(id);
    requireProductAccess(request, payout.product);
    return { payout };
  });

  app.post('/v1/payouts/:id/approve', { preHandler: requireScopes('payouts:approve') }, async (request) => {
    const id = requireUuid((request.params as { id: string }).id);
    const body = request.body && typeof request.body === 'object'
      ? request.body as { reason?: unknown }
      : {};
    requireProductAccess(request, (await payouts.getById(id)).product);
    const actor = identifyService(request)?.service ?? 'unknown';
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    return { payout: await payouts.approve(id, actor, reason) };
  });

  app.post('/v1/payouts/:id/refresh', { preHandler: requireScopes('payouts:refresh') }, async (request) => {
    const id = requireUuid((request.params as { id: string }).id);
    requireProductAccess(request, (await payouts.getById(id)).product);
    return { payout: await payouts.refresh(id) };
  });
}
