import { getMarket } from '../config/markets.js';
import { TukuPayError } from '../errors.js';
import type { CountryCode } from '../domain/payments.js';

export type MsisdnMode = 'e164' | 'local';

export function normalizeMsisdn(phone: string, country: CountryCode): string {
  const market = getMarket(country);
  let digits = phone.trim().replace(/[^0-9+]/g, '');

  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `${market.dialCode}${digits.slice(1)}`;
  else if (!digits.startsWith(market.dialCode)) digits = `${market.dialCode}${digits}`;

  if (digits.length < 8 || digits.length > 15) {
    throw new TukuPayError('Invalid mobile money phone number', 'INVALID_PHONE', 400);
  }

  return digits;
}

export function providerMsisdn(
  phoneE164Digits: string,
  country: CountryCode,
  mode: MsisdnMode,
): string {
  if (mode === 'e164') return phoneE164Digits;

  const { dialCode } = getMarket(country);
  if (!phoneE164Digits.startsWith(dialCode)) return phoneE164Digits;
  return phoneE164Digits.slice(dialCode.length);
}
