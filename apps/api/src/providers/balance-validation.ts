import { majorToMinor } from '../utils/money.js';
import { TukuPayError } from '../errors.js';
export function validateBalance(value: unknown, currency: unknown, expected: string): {available:string;currency:string} {
  if(typeof currency!=='string'||currency!==expected||typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)){
    throw new TukuPayError('Provider balance evidence is incomplete or inconsistent','BALANCE_UNVERIFIED',502);
  }
  const normalized=value.includes('.')?value.replace(/0+$/,'').replace(/\.$/,''):value;
  try{
    if(!/^0+$/.test(normalized)) {
      const minor=majorToMinor(normalized,currency);
      if(minor>9223372036854775807n)throw new Error('Balance overflow');
    }
  }catch{throw new TukuPayError('Provider balance evidence is invalid','BALANCE_UNVERIFIED',502)}
  return {available:normalized,currency};
}
