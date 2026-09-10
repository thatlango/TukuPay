import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type ServiceIdentity = {
  service: string;
  scopes: string[];
};

type RegistryEntry = ServiceIdentity & { token: string };

let cachedRaw: string | undefined;
let cachedRegistry: RegistryEntry[] = [];
const rateWindows = new Map<string, { minute: number; count: number }>();

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function registry(): RegistryEntry[] {
  const raw = process.env.TUKUPAY_SERVICE_TOKENS_JSON?.trim();
  if (raw === cachedRaw) return cachedRegistry;

  cachedRaw = raw;
  cachedRegistry = [];
  if (!raw) return cachedRegistry;

  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { token?: unknown; scopes?: unknown }
    >;
    for (const [service, config] of Object.entries(parsed)) {
      if (!config || typeof config !== 'object') continue;
      if (typeof config.token !== 'string' || config.token.length < 16) continue;
      const scopes = Array.isArray(config.scopes)
        ? config.scopes.filter((value): value is string => typeof value === 'string')
        : [];
      cachedRegistry.push({ service, token: config.token, scopes });
    }
  } catch {
    cachedRegistry = [];
  }
  return cachedRegistry;
}

function bearer(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

export function identifyService(request: FastifyRequest): ServiceIdentity | null {
  const supplied = bearer(request);
  if (!supplied) return null;

  const legacy = process.env.TUKUPAY_SERVICE_TOKEN?.trim();
  if (legacy && secureEqual(legacy, supplied)) {
    return { service: 'legacy-admin', scopes: ['*'] };
  }

  for (const entry of registry()) {
    if (secureEqual(entry.token, supplied)) {
      return { service: entry.service, scopes: entry.scopes };
    }
  }
  return null;
}

function hasScope(identity: ServiceIdentity, required: string): boolean {
  if (identity.scopes.includes('*') || identity.scopes.includes(required)) return true;
  const [family] = required.split(':');
  return identity.scopes.includes(`${family}:*`);
}

function rateLimit(identity: ServiceIdentity): boolean {
  const max = Math.max(10, Number(process.env.TUKUPAY_RATE_LIMIT_PER_MINUTE ?? 600));
  const minute = Math.floor(Date.now() / 60_000);
  const current = rateWindows.get(identity.service);
  if (!current || current.minute !== minute) {
    rateWindows.set(identity.service, { minute, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= max;
}

export function requireScopes(...required: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const identity = identifyService(request);
    if (!identity) {
      await reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Valid TukuPay service credentials are required' },
      });
      return;
    }

    if (!rateLimit(identity)) {
      await reply.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'TukuPay service request limit exceeded' },
      });
      return;
    }

    if (required.some((scope) => !hasScope(identity, scope))) {
      await reply.code(403).send({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `Required scope: ${required.join(', ')}`,
        },
      });
    }
  };
}

export const requireServiceAuth = requireScopes();
