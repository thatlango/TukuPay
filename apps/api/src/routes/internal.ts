import type { FastifyInstance } from 'fastify';
import { requireScopes } from '../auth/service-auth.js';
import type { ReconciliationService } from '../services/reconciliation.js';

export async function registerInternalRoutes(
  app: FastifyInstance,
  reconciliation: ReconciliationService,
): Promise<void> {
  app.post('/internal/reconcile', { preHandler: requireScopes('reconcile:run') }, async (request) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as { limit?: unknown }
      : {};
    const parsed = Number(body.limit ?? 50);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 500)) : 50;
    return { reconciliation: await reconciliation.runBatch(limit) };
  });
}
