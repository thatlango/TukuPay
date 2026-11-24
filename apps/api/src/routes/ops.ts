import { db } from '../db/pool.js';
import { parseReview, recordExceptionReview } from '../services/exception-review.js';
import { transportMetrics } from '../providers/telemetry.js';
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
  app.get('/v1/ops/provider-capabilities', { preHandler: requireScopes('ops:read') }, async () => ops.capabilities());

  app.get('/v1/ops/provider-transport', { preHandler: requireScopes('ops:read') }, async () => transportMetrics.snapshot());

  app.get('/v1/ops/exceptions', { preHandler: requireScopes('ops:read') }, async (request) => {
    const query = request.query as { limit?: string };
    return ops.exceptions(Number(query.limit ?? 50));
  });

  app.post('/v1/ops/exceptions/review', { preHandler: requireScopes('ops:manage') }, async (request) => {
    const actor = identifyService(request)?.service;
    if (!actor) throw new TukuPayError('Authenticated reviewer required','UNAUTHORIZED',401);
    return { review: await recordExceptionReview(parseReview(request.body), actor) };
  });

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

  app.get('/v1/ops/dispatch-recovery', {preHandler:requireScopes('ops:read')},async()=>{
    const result=await db.query(
      `SELECT kind,transaction_id,phase,created_at,attempted_at,observed_at
        FROM financial_dispatch_records WHERE phase IN ('RESERVED','ATTEMPTING')
        ORDER BY created_at LIMIT 100`);
    return {records:result.rows,policy:'Review only; no automatic resubmission'};
  });
  app.post('/v1/ops/settlements/:id/review',{preHandler:requireScopes('settlements:review')},async request=>{
    const {id}=request.params as {id:string};
    return {settlement:await settlements.review(id,request.body,identifyService(request)?.service??'unknown')};
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
