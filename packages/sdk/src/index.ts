export type Provider = 'mtn' | 'airtel';

export type Money = { amount: string; currency: string };

export type Payment = {
  id: string;
  product: string;
  externalId: string;
  country: string;
  provider: Provider | null;
  providerReference: string | null;
  amount: string;
  currency: string;
  phone: string;
  status: 'CREATED' | 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  providerStatus: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
};

export type Payout = {
  id: string;
  product: string;
  externalId: string;
  country: string;
  provider: Provider;
  providerReference: string | null;
  amount: string;
  currency: string;
  phone: string;
  status: 'APPROVAL_REQUIRED' | 'APPROVED' | 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED';
  providerStatus: string | null;
  lastError: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  metadata: Record<string, unknown>;
};

export type CreatePayment = {
  externalId: string;
  country: string;
  provider?: Provider;
  money: Money;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type CreatePayout = CreatePayment;
export type CandidateProvider = 'mpesa' | 'paystack' | 'flutterwave' | 'wave' | 'orange';
export type ProviderCapability = {
  provider: Provider;
  environment: 'sandbox' | 'production' | null;
  marketEnabled: boolean;
  runtime: 'simulator' | 'operator';
  collection: { configured: boolean; available: boolean };
  payout: { configured: boolean; available: boolean };
  balance: { configured: boolean; available: boolean };
  callbacks: 'wake-up-only' | 'disabled';
};
export type Capabilities = {
  simulator: boolean;
  markets: { country: string; currency: string; providers: ProviderCapability[] }[];
  candidates: { provider: CandidateProvider; initialCountry: string | null; status: 'planned'; contractStage?: string }[];
  note: string;
};
export type PaymentException = {
  kind: 'collection' | 'payout'; id: string; product_code: string; country_code: string;
  provider_code: Provider; currency: string; status: string; created_at: string;
  last_checked_at: string | null; attempts: number; has_error: boolean; reason: string;
  review_state: 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'REVIEWED' | null;
  assigned_to: string | null; review_updated_at: string | null; review_version: number;
};
export class TukuPayApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'TukuPayApiError';
  }
}

export type TukuPayClientOptions = {
  baseUrl: string;
  token: string;
  product: string;
  timeoutMs?: number;
};

export class TukuPayClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly product: string;
  private readonly timeoutMs: number;

  constructor(options: TukuPayClientOptions) {
    const url = new URL(options.baseUrl);
    const loopback = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Invalid TukuPay API origin');
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.token = options.token;
    this.product = options.product.toLowerCase();
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const init: RequestInit = {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await fetch(`${this.baseUrl}${path}`, init);
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string } } | null;
      throw new TukuPayApiError(response.status, error?.error?.code ?? 'ERROR', error?.error?.message ?? 'Request failed');
    }
    if (payload === null || typeof payload !== 'object') throw new TukuPayApiError(response.status, 'INVALID_RESPONSE', 'Invalid TukuPay response');
    return payload as T;
  }

  async createPayment(input: CreatePayment, idempotencyKey: string): Promise<Payment> {
    if (!idempotencyKey.trim()) throw new Error('Idempotency key is required');
    const result = await this.request<{ payment: Payment }>(
      'POST',
      '/v1/payments',
      { ...input, product: this.product },
      idempotencyKey,
    );
    return result.payment;
  }

  async getPayment(id: string): Promise<Payment> {
    const result = await this.request<{ payment: Payment }>('GET', `/v1/payments/${encodeURIComponent(id)}`);
    return result.payment;
  }

  async refreshPayment(id: string): Promise<Payment> {
    const result = await this.request<{ payment: Payment }>('POST', `/v1/payments/${encodeURIComponent(id)}/refresh`);
    return result.payment;
  }

  async createPayout(input: CreatePayout, idempotencyKey: string): Promise<Payout> {
    if (!idempotencyKey.trim()) throw new Error('Idempotency key is required');
    return (await this.request<{ payout: Payout }>('POST', '/v1/payouts', { ...input, product: this.product }, idempotencyKey)).payout;
  }
  async getPayout(id: string): Promise<Payout> {
    return (await this.request<{ payout: Payout }>('GET', '/v1/payouts/' + encodeURIComponent(id))).payout;
  }
  async approvePayout(id: string, reason: string): Promise<Payout> {
    if (!reason.trim()) throw new Error('Approval reason is required');
    return (await this.request<{ payout: Payout }>('POST', '/v1/payouts/' + encodeURIComponent(id) + '/approve', { reason })).payout;
  }
  async refreshPayout(id: string): Promise<Payout> {
    return (await this.request<{ payout: Payout }>('POST', '/v1/payouts/' + encodeURIComponent(id) + '/refresh')).payout;
  }
  async getCapabilities(): Promise<Capabilities> {
    return this.request<Capabilities>('GET','/v1/ops/provider-capabilities');
  }
  async getExceptions(limit = 50): Promise<{ generatedAt: string; limit: number; exceptions: PaymentException[] }> {
    const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 50;
    return this.request('GET','/v1/ops/exceptions?limit=' + bounded);
  }
  async reviewException(input: { kind: 'collection' | 'payout'; id: string; state: 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'REVIEWED'; assignedTo: string | null; note: string; expectedVersion: number }) {
    return this.request<{ review: Record<string, unknown> }>('POST','/v1/ops/exceptions/review',input);
  }
  async getOpsSummary(): Promise<{ ops: Record<string, unknown> }> {
    return this.request('GET','/v1/ops/summary');
  }
  async getProviderTransport(): Promise<{ startedAt: string; generatedAt: string; scope: 'process-local'; metrics: Record<string, unknown>[] }> {
    return this.request('GET','/v1/ops/provider-transport');
  }
}
