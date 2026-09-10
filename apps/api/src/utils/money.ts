import { TukuPayError } from '../errors.js';

const EXPONENTS: Record<string, number> = {
  BIF: 0,
  CDF: 2,
  GHS: 2,
  GNF: 0,
  KES: 2,
  LRD: 2,
  MGA: 2,
  MWK: 2,
  NGN: 2,
  RWF: 0,
  SCR: 2,
  SSP: 2,
  SZL: 2,
  TZS: 2,
  UGX: 0,
  XAF: 0,
  XOF: 0,
  ZAR: 2,
  ZMW: 2,
};

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function majorToMinor(amount: string, currency: string): bigint {
  const value = amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new TukuPayError('Amount must be a positive decimal number', 'INVALID_AMOUNT', 400);
  }

  const exponent = currencyExponent(currency);
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > exponent) {
    throw new TukuPayError(
      `${currency.toUpperCase()} supports at most ${exponent} decimal places`,
      'INVALID_AMOUNT_PRECISION',
      400,
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const minor = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(padded || '0');
  if (minor <= 0n) {
    throw new TukuPayError('Amount must be greater than zero', 'INVALID_AMOUNT', 400);
  }
  return minor;
}

export function minorToMajor(minorValue: string | bigint, currency: string): string {
  const minor = typeof minorValue === 'bigint' ? minorValue : BigInt(minorValue);
  const exponent = currencyExponent(currency);
  if (exponent === 0) return minor.toString();

  const scale = 10n ** BigInt(exponent);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(exponent, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
