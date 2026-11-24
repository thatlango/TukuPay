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

test('currency policy rejects unlisted currencies and amounts beyond signed BIGINT', () => {
  assert.throws(() => majorToMinor('1', 'ZZZ'));
  assert.throws(() => majorToMinor('1', 'constructor'));
  assert.throws(() => majorToMinor('9223372036854775808', 'UGX'));
  assert.throws(() => majorToMinor('92233720368547758.08', 'KES'));
  assert.equal(majorToMinor('92233720368547758.07', 'KES'), 9223372036854775807n);
  assert.equal(majorToMinor('1.20', 'EUR'), 120n);
  assert.equal(majorToMinor('0.01', 'USD'), 1n);
});

test('signed formatting preserves exact amount and zero', () => {
  assert.equal(minorToMajor('-1','KES'),'-0.01');
  assert.equal(minorToMajor('-101','KES'),'-1.01');
  assert.equal(minorToMajor(-120n,'USD'),'-1.2');
  assert.equal(minorToMajor('0','EUR'),'0');
  assert.equal(minorToMajor('-1000','UGX'),'-1000');
  assert.equal(minorToMajor(9223372036854775808n,'KES'),'92233720368547758.08');
  for (const value of ['', ' 1', '0x10', '1e2', '1.0', '+1', '01']) assert.throws(()=>minorToMajor(value,'KES'));
});
