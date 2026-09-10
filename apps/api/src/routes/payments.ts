import type { FastifyInstance } from 'fastify';
import { requireServiceAuth } from '../auth/service-auth.js';
import type { CreatePaymentInput, ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import type { PaymentService } from '../services/payment-service.js';

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TukuPayError(`${name} must be an object`, 'VALIDATION_ERROR', 400);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TukuPayError(`${name} is required`, 'VALIDATION_ERROR', 400);
  }
  return value.trim();
}

function parseInput(body: unknown): CreatePaymentInput {
  const root = object(body, 'body');
  const money = object(root.money, 'money');
  const input: CreatePaymentInput = {
    product: requiredString(root.product, 'product'),
    externalId: requiredString(root.externalId, 'externalId'),
    country: requiredString(root.country, 'country').toUpperCase(),
    money: {
      amount: requiredString(money.amount, 'money.amount'),
      currency: requiredString(money.currency, 'money.currency').toUpperCase(),
    },
    phone: requiredString(root.phone, 'phone'),
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

export async function registerPaymentRoutes(
  app: FastifyInstance,
  payments: PaymentService,
): Promise<void> {
  app.post('/v1/payments', { preHandler: requireServiceAuth }, async (request, reply) => {
    const header = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;
    const payment = await payments.create(parseInput(request.body), idempotencyKey);
    return reply.code(payment.status === 'PENDING' ? 202 : 201).send({ payment });
  });

  app.get('/v1/payments/:id', { preHandler: requireServiceAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return { payment: await payments.getById(id) };
  });

  app.post('/v1/payments/:id/refresh', { preHandler: requireServiceAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return { payment: await payments.refresh(id) };
  });
}
