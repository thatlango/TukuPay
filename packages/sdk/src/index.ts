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
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
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
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await fetch(`${this.baseUrl}${path}`, init);
    const payload = await response.json() as unknown;
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string } };
      throw new Error(
        `TukuPay ${response.status} ${error.error?.code ?? 'ERROR'}: ${error.error?.message ?? 'Request failed'}`,
      );
    }
    return payload as T;
  }

  async createPayment(input: CreatePayment, idempotencyKey: string): Promise<Payment> {
    const result = await this.request<{ payment: Payment }>(
      'POST',
      '/v1/payments',
      { ...input, product: this.product },
      idempotencyKey,
    );
    return result.payment;
  }

  async getPayment(id: string): Promise<Payment> {
    const result = await this.request<{ payment: Payment }>('GET', `/v1/payments/${id}`);
    return result.payment;
  }

  async refreshPayment(id: string): Promise<Payment> {
    const result = await this.request<{ payment: Payment }>('POST', `/v1/payments/${id}/refresh`);
    return result.payment;
  }
}
