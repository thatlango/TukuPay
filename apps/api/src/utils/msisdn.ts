import { getMarket } from '../config/markets.js';
import { TukuPayError } from '../errors.js';
import type { CountryCode } from '../domain/payments.js';

export type MsisdnMode = 'e164' | 'local';

function invalid(): never {
  throw new TukuPayError('Invalid mobile money phone number','INVALID_PHONE',400);
}
function parsePhone(phone:string): {digits:string; international:boolean} {
  const text=phone.trim();
  if(!/^\+?[0-9][0-9 ()-]*$/.test(text)||text.length>64)invalid();
  const compact=text.replace(/[ ()-]/g,'');
  const international=compact.startsWith('+')||compact.startsWith('00');
  const digits=compact.startsWith('+')?compact.slice(1):compact.startsWith('00')?compact.slice(2):compact;
  if(!/^\d+$/.test(digits))invalid();
  return {digits,international};
}
function checkDigits(digits:string): string {
  if(!/^[1-9][0-9]{7,14}$/.test(digits))invalid();
  return digits;
}
export function normalizeSandboxMsisdn(phone:string): string {
  return checkDigits(parsePhone(phone).digits);
}
export function normalizeMsisdn(phone:string,country:CountryCode): string {
  const {dialCode}=getMarket(country);
  const {digits,international}=parsePhone(phone);
  if(international){
    if(!digits.startsWith(dialCode)||digits.length<=dialCode.length||digits[dialCode.length]==='0')invalid();
    return checkDigits(digits);
  }
  const normalized=digits.startsWith('0')?dialCode+digits.slice(1):digits.startsWith(dialCode)?digits:dialCode+digits;
  if(normalized.length<=dialCode.length||normalized[dialCode.length]==='0')invalid();
  return checkDigits(normalized);
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
