import { TukuPayError } from '../errors.js';
import type { ProviderCode } from '../domain/payments.js';

export type CallbackMode = 'wake-up-only' | 'disabled';

export function callbackMode(provider: ProviderCode, country: string, environment: 'sandbox' | 'production', env: NodeJS.ProcessEnv = process.env): CallbackMode {
  if (!/^[A-Z]{2}$/.test(country)) return 'disabled';
  // No native signature contract has been confirmed for these operator accounts.
  // Unsigned production callbacks are opt-in only after ingress review.
  if (environment === 'sandbox') return 'wake-up-only';
  const name = provider.toUpperCase() + '_' + country + '_UNSIGNED_CALLBACKS_ENABLED';
  return env[name] === 'true' ? 'wake-up-only' : 'disabled';
}

export function requireCallbackMode(provider: ProviderCode, country: string, environment: 'sandbox' | 'production'): void {
  if (callbackMode(provider, country, environment) === 'disabled') {
    throw new TukuPayError('Callbacks are disabled for this market', 'CALLBACK_DISABLED', 403);
  }
}

export function validProviderReference(value: string): boolean {
  return /^[a-zA-Z0-9._-]{1,128}$/.test(value);
}
