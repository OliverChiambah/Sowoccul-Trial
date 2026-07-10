import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as money from '../src/lib/money.js';

test('fromDb parses string bigint from pg', () => {
  assert.equal(money.fromDb('100000'), 100000);
  assert.equal(money.fromDb('0'), 0);
  assert.equal(money.fromDb('-500'), -500);
});

test('fromDb accepts number and bigint', () => {
  assert.equal(money.fromDb(4200), 4200);
  assert.equal(money.fromDb(10n), 10);
});

test('fromDb rejects non-integer strings', () => {
  assert.throws(() => money.fromDb('12.5'), /whole number/);
  assert.throws(() => money.fromDb('abc'), /whole number/);
});

test('fromDb rejects null/undefined', () => {
  assert.throws(() => money.fromDb(null), /Missing amount/);
  assert.throws(() => money.fromDb(undefined), /Missing amount/);
});

test('fromDb rejects unsafe integers', () => {
  const tooBig = String(Number.MAX_SAFE_INTEGER) + '0';
  assert.throws(() => money.fromDb(tooBig), /safe integer|range/);
});

test('fromUser accepts positive whole amounts', () => {
  assert.equal(money.fromUser(5000), 5000);
  assert.equal(money.fromUser('2500'), 2500);
});

test('fromUser rejects zero by default, allows with allowZero', () => {
  assert.throws(() => money.fromUser(0), /at least/);
  assert.equal(money.fromUser(0, { allowZero: true, min: 0 }), 0);
});

test('fromUser rejects decimals and negatives (default)', () => {
  assert.throws(() => money.fromUser(10.5), /whole francs/);
  assert.throws(() => money.fromUser(-100), /at least/);
});

test('fromUser allowZero still rejects negatives', () => {
  assert.throws(() => money.fromUser(-1, { allowZero: true, min: 0 }), /negative/);
});

test('fromUser rejects non-numeric', () => {
  assert.throws(() => money.fromUser('xyz'), /valid amount/);
  assert.throws(() => money.fromUser(null), /valid amount/);
});

test('add and subtract guard the safe range', () => {
  assert.equal(money.add(100, 50), 150);
  assert.equal(money.subtract(100, 30), 70);
  assert.throws(() => money.add(Number.MAX_SAFE_INTEGER, 1), /too large/);
});

test('MoneyError is user-safe', () => {
  try { money.fromUser(-1); } catch (e) {
    assert.equal(e.name, 'MoneyError');
    assert.equal(e.userSafe, true);
  }
});
