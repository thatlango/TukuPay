import assert from 'node:assert/strict';
import test from 'node:test';
import { majorToMinor, minorToMajor } from './money.js';

test('UGX is stored without fractional minor units', () => {
  assert.equal(majorToMinor('68000', 'UGX'), 68000n);
  assert.equal(minorToMajor('68000', 'UGX'), '68000');
});

test('decimal currencies round-trip exactly', () => {
  assert.equal(majorToMinor('100.50', 'KES'), 10050n);
  assert.equal(minorToMajor('10050', 'KES'), '100.5');
});
