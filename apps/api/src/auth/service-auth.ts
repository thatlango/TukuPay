import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const expected = process.env.TUKUPAY_SERVICE_TOKEN?.trim();
  const authorization = request.headers.authorization ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!expected || !supplied || !secureEqual(expected, supplied)) {
    await reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Valid TukuPay service credentials are required' },
    });
  }
}
