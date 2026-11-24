import { TukuPayError } from '../errors.js';

export function readPayoutLimits(country: string, currency: string, env: NodeJS.ProcessEnv = process.env) {
  if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z]{3}$/.test(currency)) {
    throw new TukuPayError('Invalid payout market', 'PAYOUT_LIMIT_CONFIGURATION', 503);
  }
  const prefix = 'TUKUPAY_PAYOUT_' + country + '_' + currency;
  const max = env[prefix + '_MAX_MINOR'];
  const daily = env[prefix + '_DAILY_MINOR'];
  if (!max || !daily || !/^[1-9][0-9]{0,17}$/.test(max) || !/^[1-9][0-9]{0,17}$/.test(daily) || BigInt(daily) < BigInt(max)) {
    throw new TukuPayError('Payout limits are not configured', 'PAYOUT_LIMIT_CONFIGURATION', 503);
  }
  return { max: BigInt(max), daily: BigInt(daily) };
}
export function checkPayoutLimits(amount: bigint, reserved: bigint, limits: { max: bigint; daily: bigint }): void {
  if (amount <= 0n || reserved < 0n || amount > limits.max || reserved + amount > limits.daily) {
    throw new TukuPayError('Payout exceeds configured limit', 'PAYOUT_LIMIT_EXCEEDED', 403);
  }
}
