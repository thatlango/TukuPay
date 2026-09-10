import type { FastifyInstance } from 'fastify';
import { identifyService, requireScopes } from '../auth/service-auth.js';
import type { ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import type { OpsService } from '../services/ops-service.js';
import type { SettlementService } from '../services/settlement-service.js';

export async function registerOpsRoutes(
  app: FastifyInstance,
  ops: OpsService,
  settlements: SettlementService,
): Promise<void> {
  app.get('/v1/ops/summary', { preHandler: requireScopes('ops:read') }, async () => ({
    ops: await ops.summary(),
  }));

  app.post('/v1/ops/balances/refresh', { preHandler: requireScopes('ops:balances') }, async (request) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    if (body.provider !== 'mtn' && body.provider !== 'airtel') {
      throw new TukuPayError('provider must be mtn or airtel', 'INVALID_PROVIDER', 400);
    }
    const country = typeof body.country === 'string' ? body.country.toUpperCase() : '';
    const account = body.account === 'disbursement' ? 'disbursement' : 'collection';
    return { balance: await ops.captureBalance(body.provider as ProviderCode, country, account) };
  });

  app.post('/v1/ops/settlements', { preHandler: requireScopes('settlements:write') }, async (request) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    if (body.provider !== 'mtn' && body.provider !== 'airtel') {
      throw new TukuPayError('provider must be mtn or airtel', 'INVALID_PROVIDER', 400);
    }
    for (const field of ['country','currency','settlementReference','grossAmount']) {
      if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
        throw new TukuPayError(`${field} is required`, 'VALIDATION_ERROR', 400);
      }
    }
    const actor = identifyService(request)?.service ?? 'unknown';
    const payload: Parameters<SettlementService['record']>[0] = {
      provider: body.provider as ProviderCode,
      country: String(body.country),
      currency: String(body.currency),
      settlementReference: String(body.settlementReference),
      grossAmount: String(body.grossAmount),
    };
    if (typeof body.feeAmount === 'string') payload.feeAmount = body.feeAmount;
    if (typeof body.bankReference === 'string') payload.bankReference = body.bankReference;
    if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
      payload.metadata = body.metadata as Record<string, unknown>;
    }
    return { settlement: await settlements.record(payload, actor) };
  });
}
