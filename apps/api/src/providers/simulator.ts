import { getMarket } from '../config/markets.js';
import { simulatorEnabled } from '../config/provider-credentials.js';
import { db } from '../db/pool.js';
import type {
  CountryCode,
  PaymentStatus,
  ProviderCode,
  ProviderTransaction,
} from '../domain/payments.js';
import { ProviderHttpError } from './http.js';
import type { PaymentProviderAdapter, ProviderContext } from './types.js';

type Kind = 'collection' | 'payout';

type SimulatorScenario =
  | 'success'
  | 'delayed_success'
  | 'timeout_then_success'
  | 'pending'
  | 'rejected'
  | 'insufficient_funds'
  | 'wrong_pin'
  | 'provider_outage';

function scenario(metadata: Record<string, unknown> | undefined): SimulatorScenario {
  const value = String(metadata?.simulatorScenario ?? 'success').toLowerCase();
  const supported: SimulatorScenario[] = [
    'success','delayed_success','timeout_then_success','pending',
    'rejected','insufficient_funds','wrong_pin','provider_outage',
  ];
  return supported.includes(value as SimulatorScenario) ? value as SimulatorScenario : 'success';
}

function terminalForScenario(value: SimulatorScenario, polls: number): PaymentStatus {
  if (['rejected', 'insufficient_funds', 'wrong_pin'].includes(value)) return 'FAILED';
  if (value === 'pending' || value === 'provider_outage') return 'PENDING';
  if (value === 'delayed_success') return polls >= 3 ? 'SUCCESSFUL' : 'PENDING';
  if (value === 'timeout_then_success') return polls >= 2 ? 'SUCCESSFUL' : 'PENDING';
  return polls >= 1 ? 'SUCCESSFUL' : 'PENDING';
}

export class SimulatedProviderAdapter implements PaymentProviderAdapter {
  constructor(readonly provider: ProviderCode) {}

  supports(country: CountryCode): boolean {
    if (!simulatorEnabled()) return false;
    return getMarket(country).providers.some((item) => item.provider === this.provider && item.enabled);
  }

  supportsOperation(country: CountryCode): boolean {
    return this.supports(country);
  }

  private async begin(
    kind: Kind,
    context: ProviderContext,
    input: { money: { amount: string }; metadata?: Record<string, unknown> },
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const selected = scenario(input.metadata);
    const status = terminalForScenario(selected, 0);
    await db.query(
      `INSERT INTO simulator_transactions
        (provider_code, country_code, provider_reference, kind, scenario,
         normalized_status, polls, amount_major, currency)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8)
       ON CONFLICT (provider_code,country_code,provider_reference,kind) DO NOTHING`,
      [this.provider, context.country, providerReference, kind, selected, status, input.money.amount, context.currency],
    );

    if (selected === 'provider_outage') {
      throw new ProviderHttpError(this.provider, 503, 'simulated provider outage');
    }
    if (selected === 'timeout_then_success') {
      throw new ProviderHttpError(this.provider, 504, 'simulated request timeout');
    }

    return {
      provider: this.provider,
      country: context.country,
      providerReference,
      status,
      raw: { simulated: true, scenario: selected, kind },
    };
  }

  private async poll(
    kind: Kind,
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    const result = await db.query<{ scenario: SimulatorScenario; polls: number }>(
      `UPDATE simulator_transactions
          SET polls = polls + 1, updated_at = now()
        WHERE provider_code = $1 AND country_code = $2
          AND provider_reference = $3 AND kind = $4
      RETURNING scenario, polls`,
      [this.provider, context.country, providerReference, kind],
    );
    const row = result.rows[0];
    if (!row) throw new ProviderHttpError(this.provider, 404, 'simulated transaction not found');

    const status = terminalForScenario(row.scenario, row.polls);
    await db.query(
      `UPDATE simulator_transactions
          SET normalized_status = $5, updated_at = now()
        WHERE provider_code = $1 AND country_code = $2
          AND provider_reference = $3 AND kind = $4`,
      [this.provider, context.country, providerReference, kind, status],
    );
    return {
      status,
      raw: { simulated: true, scenario: row.scenario, kind, polls: row.polls, status },
    };
  }

  collect(
    context: ProviderContext,
    input: Parameters<PaymentProviderAdapter['collect']>[1],
    providerReference: string,
  ): Promise<ProviderTransaction> {
    return this.begin('collection', context, input, providerReference);
  }

  getStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    return this.poll('collection', context, providerReference);
  }

  payout(
    context: ProviderContext,
    input: NonNullable<Parameters<NonNullable<PaymentProviderAdapter['payout']>>[1]>,
    providerReference: string,
  ): Promise<ProviderTransaction> {
    return this.begin('payout', context, input, providerReference);
  }

  getPayoutStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    return this.poll('payout', context, providerReference);
  }

  async getBalance(
    context: ProviderContext,
    account: 'collection' | 'disbursement',
  ): Promise<{ available: string; currency: string; raw?: unknown }> {
    const available = process.env.TUKUPAY_SIMULATOR_BALANCE ?? '10000000';
    return {
      available,
      currency: context.currency,
      raw: { simulated: true, provider: this.provider, account },
    };
  }
}
