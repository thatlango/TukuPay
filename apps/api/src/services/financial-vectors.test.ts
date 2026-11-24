import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { majorToMinor, minorToMajor } from '../utils/money.js';
import { checkPayoutLimits } from './payout-limits.js';

const rows = (name: string) => readFileSync(new URL('../../../../contracts/financial/' + name, import.meta.url),'utf8')
  .trimEnd().split('\n').slice(1).map(line => line.split('\t'));
test('TypeScript matches shared financial money vectors', () => {
  for (const [currency, major, outcome, minor, canonical] of rows('money.tsv')) {
    assert(currency !== undefined && major !== undefined);
    if (outcome === 'ok') {
      const actual = majorToMinor(major,currency);
      assert.equal(actual.toString(),minor);
      assert.equal(minorToMajor(actual,currency),canonical);
    } else assert.throws(() => majorToMinor(major,currency));
  }
});
test('TypeScript matches shared payout limit vectors', () => {
  for (const [amount,reserved,max,daily,outcome] of rows('limits.tsv')) {
    assert(amount !== undefined && reserved !== undefined && max !== undefined && daily !== undefined);
    const run = () => checkPayoutLimits(BigInt(amount),BigInt(reserved),{max:BigInt(max),daily:BigInt(daily)});
    if(outcome === 'allow') assert.doesNotThrow(run);
    else assert.throws(run);
  }
});
