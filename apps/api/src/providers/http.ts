export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly body: string,
    message = `${provider} returned HTTP ${status}`,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

const RETRYABLE_READ = new Set([408, 429, 502, 503, 504]);
const MAX_RESPONSE_BYTES = 1_048_576;

export function retryDelay(value: string | null, attempt: number, now = Date.now()): number {
  if (value !== null) {
    const seconds = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
    if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(0, seconds));
  }
  return Math.min(30_000, 250 * 2 ** attempt + Math.floor(Math.random() * 250));
}

/** Read-only retries. Financial writes and token requests are never replayed here. */
export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (target.username || target.password || (target.protocol !== 'https:' && !(local && target.protocol === 'http:'))) {
    throw new Error('Provider endpoint must use HTTPS (loopback HTTP is allowed for tests)');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      const timeout = AbortSignal.timeout(15_000);
      response = await fetch(target, {
        ...init,
        redirect: 'manual',
        signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
    } catch (error) {
      if (!safe || attempt >= 2 || init.signal?.aborted) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelay(null, attempt)));
      continue;
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('Provider redirect rejected');
    }
    if (safe && attempt < 2 && RETRYABLE_READ.has(response.status)) {
      const delay = retryDelay(response.headers.get('retry-after'), attempt);
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    return response;
  }
}

export async function responsePayload(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Provider response exceeded size limit');
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Provider response exceeded size limit');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
