import type { TransportScope } from './telemetry.js';
import { createHash } from 'node:crypto';
import { providerFetch } from './http.js';

export function credentialKey(parts: readonly (string | undefined)[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

type Token = { token: string; expiresAt: number };

export function parseToken(payload: unknown, now = Date.now()): Token {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid provider token response');
  const data = payload as { access_token?: unknown; expires_in?: unknown };
  const lifetime = Number(data.expires_in);
  if (typeof data.access_token !== 'string' || !data.access_token.trim()
      || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 86_400 * 365) {
    throw new Error('Invalid provider token response');
  }
  return { token: data.access_token, expiresAt: now + lifetime * 1000 };
}

/** One token refresh per credential scope, including overlapping 401 responses. */
export class TokenCache {
  private readonly values = new Map<string, Token>();
  private readonly pending = new Map<string, Promise<Token>>();

  async get(key: string, load: () => Promise<Token>): Promise<string> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
    let current = this.pending.get(key);
    if (!current) {
      current = Promise.resolve().then(load).then(value => {
        if (this.values.size >= 256 && !this.values.has(key)) {
          const first = this.values.keys().next().value;
          if (first !== undefined) this.values.delete(first);
        }
        this.values.set(key, value);
        return value;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, current);
    }
    return (await current).token;
  }

  invalidate(key: string, expected: string): void {
    if (this.values.get(key)?.token === expected) this.values.delete(key);
  }
}

export async function authorizedProviderFetch(
  cache: TokenCache,
  key: string,
  load: () => Promise<Token>,
  url: string,
  init: RequestInit = {},
  scope?: TransportScope,
): Promise<Response> {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase());
  for (let attempt = 0; ; attempt++) {
    const token = await cache.get(key, load);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await providerFetch(url, { ...init, headers }, scope);
    if (response.status !== 401) return response;
    cache.invalidate(key, token);
    // A financial write is never replayed, even on an authentication error.
    if (!safe || attempt > 0) return response;
    await response.body?.cancel();
  }
}
