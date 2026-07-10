import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v, validate } from '../src/lib/validate.js';

test('required fields flag when missing', () => {
  const { ok, errors } = validate({ name: v.string() }, {});
  assert.equal(ok, false);
  assert.equal(errors.name, 'is required');
});

test('string transforms: trim + lower', () => {
  const { ok, value } = validate({ u: v.string().trim().lower() }, { u: '  ADMIN  ' });
  assert.equal(ok, true);
  assert.equal(value.u, 'admin');
});

test('int coercion from numeric string', () => {
  const { ok, value } = validate({ amount: v.int().min(1) }, { amount: '2500' });
  assert.equal(ok, true);
  assert.equal(value.amount, 2500);
  assert.equal(typeof value.amount, 'number');
});

test('int rejects decimals', () => {
  const { ok, errors } = validate({ amount: v.int() }, { amount: '12.5' });
  assert.equal(ok, false);
  assert.match(errors.amount, /whole number/);
});

test('min/max on numbers', () => {
  assert.equal(validate({ a: v.int().min(1) }, { a: 0 }).ok, false);
  assert.equal(validate({ a: v.int().max(10) }, { a: 11 }).ok, false);
  assert.equal(validate({ a: v.int().min(1).max(10) }, { a: 5 }).ok, true);
});

test('min/max on string length', () => {
  assert.equal(validate({ p: v.string().min(8) }, { p: 'short' }).ok, false);
  assert.equal(validate({ p: v.string().max(3) }, { p: 'toolong' }).ok, false);
});

test('email validation', () => {
  assert.equal(validate({ e: v.string().email() }, { e: 'a@b.co' }).ok, true);
  assert.equal(validate({ e: v.string().email() }, { e: 'nope' }).ok, false);
});

test('oneOf constraint', () => {
  const schema = { kind: v.string().oneOf(['deposit', 'withdrawal']) };
  assert.equal(validate(schema, { kind: 'deposit' }).ok, true);
  assert.equal(validate(schema, { kind: 'hack' }).ok, false);
});

test('optional fields skip when absent', () => {
  const { ok, value } = validate({ note: v.string().optional() }, {});
  assert.equal(ok, true);
  assert.equal('note' in value, false);
});

test('default fills when absent', () => {
  const { value } = validate({ page: v.int().default(1) }, {});
  assert.equal(value.page, 1);
});

test('unknown fields are dropped, not echoed', () => {
  const { value } = validate({ a: v.int() }, { a: 1, evil: 'DROP TABLE users' });
  assert.deepEqual(value, { a: 1 });
});

test('bool coercion from strings', () => {
  assert.equal(validate({ t: v.bool() }, { t: 'true' }).value.t, true);
  assert.equal(validate({ t: v.bool() }, { t: '0' }).value.t, false);
  assert.equal(validate({ t: v.bool() }, { t: 'maybe' }).ok, false);
});

test('custom predicate', () => {
  const even = v.int().custom((n) => n % 2 === 0 || 'must be even');
  assert.equal(validate({ n: even }, { n: 4 }).ok, true);
  assert.equal(validate({ n: even }, { n: 3 }).errors.n, 'must be even');
});

test('multiple errors collected', () => {
  const { ok, errors } = validate(
    { a: v.int().min(1), b: v.string().email() },
    { a: 0, b: 'bad' }
  );
  assert.equal(ok, false);
  assert.equal(Object.keys(errors).length, 2);
});
