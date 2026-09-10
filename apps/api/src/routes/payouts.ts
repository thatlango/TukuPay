import type { FastifyInstance } from 'fastify';
import { identifyService, requireScopes } from '../auth/service-auth.js';
import type { ProviderCode } from '../domain/payments.js';
import type { CreatePayoutInput } from '../domain/payouts.js';
import { TukuPayError } from '../errors.js';
import type { PayoutService } from '../services/payout-service.js';

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TukuPayError(`${field} must be an object`, 'VALIDATION_ERROR', 400);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TukuPayError(`${field} is required`, 'VALIDATION_ERROR', 400);
  }
  return value.trim();
}

function parse(body: unknown): CreatePayoutInput {
  const root = object(body, 'body');
  const money = object(root.money, 'money');
  const input: CreatePayoutInput = {
    product: text(root.product, 'product'),
    externalId: text(root.externalId, 'externalId'),
    country: text(root.country, 'country').toUpperCase(),
    money: {
      amount: text(money.amount, 'money.amount'),
      currency: text(money.currency, 'money.currency').toUpperCase(),
    },
    phone: text(root.phone, 'phone'),
  };
  if (root.provider !== undefined) {
    if (root.provider !== 'mtn' && root.provider !== 'airtel') {
      throw new TukuPayError('provider must be mtn or airtel', 'INVALID_PROVIDER', 400);
    }
    input.provider = root.provider as ProviderCode;
  }
  if (typeof root.description === 'string' && root.description.trim()) {
    input.description = root.description.trim();
  }
  if (root.metadata !== undefined) input.metadata = object(root.metadata, 'metadata');
  return input;
}

export async function registerPayoutRoutes(
  app: FastifyInstance,
  payouts: PayoutService,
): Promise<void> {
  app.post('/v1/payouts', { preHandler: requireScopes('payouts:create') }, async (request, reply) => {
    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    const payout = await payouts.create(parse(request.body), key);
    return reply.code(201).send({ payout });
  });

  app.get('/v1/payouts/:id', { preHandler: requireScopes('payouts:read') }, async (request) => {
    const { id } = request.params as { id: string };
    return { payout: await payouts.getById(id) };
  });

  app.post('/v1/payouts/:id/approve', { preHandler: requireScopes('payouts:approve') }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body && typeof request.body === 'object'
      ? request.body as { reason?: unknown }
      : {};
    const actor = identifyService(request)?.service ?? 'unknown';
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    return { payout: await payouts.approve(id, actor, reason) };
  });

  app.post('/v1/payouts/:id/refresh', { preHandler: requireScopes('payouts:refresh') }, async (request) => {
    const { id } = request.params as { id: string };
    return { payout: await payouts.refresh(id) };
  });
}
