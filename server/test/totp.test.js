import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Encode, base32Decode, generateSecret, totp, verifyTotp,
  otpauthUri, generateRecoveryCodes, hashRecoveryCode,
} from '../src/lib/totp.js';

test('base32 round-trips arbitrary bytes', () => {
  for (const s of ['hello', 'SOWOCCUL', 'a', '']) {
    const buf = Buffer.from(s);
    assert.equal(base32Decode(base32Encode(buf)).toString(), s);
  }
});

test('generateSecret produces valid base32 of expected length', () => {
  const secret = generateSecret(20);
  assert.match(secret, /^[A-Z2-7]+$/);
  // 20 bytes → 32 base32 chars
  assert.equal(secret.length, 32);
});

test('TOTP matches RFC 6238 test vector (SHA1)', () => {
  // RFC 6238 uses ASCII secret "12345678901234567890". At T=59s, step 30,
  // 8-digit code is 94287082 → 6-digit is 287082.
  const secretB32 = base32Encode(Buffer.from('12345678901234567890'));
  const code = totp(secretB32, { time: 59 * 1000, step: 30, digits: 6 });
  assert.equal(code, '287082');
});

test('TOTP matches a second RFC vector', () => {
  const secretB32 = base32Encode(Buffer.from('12345678901234567890'));
  // T=1111111109 → 8-digit 07081804 → 6-digit 081804
  const code = totp(secretB32, { time: 1111111109 * 1000, step: 30, digits: 6 });
  assert.equal(code, '081804');
});

test('verifyTotp accepts the current code', () => {
  const secret = generateSecret();
  const now = Date.now();
  const code = totp(secret, { time: now });
  assert.equal(verifyTotp(secret, code, { time: now }), true);
});

test('verifyTotp tolerates ±1 step of clock drift', () => {
  const secret = generateSecret();
  const now = Date.now();
  const codePrev = totp(secret, { time: now - 30_000 });
  const codeNext = totp(secret, { time: now + 30_000 });
  assert.equal(verifyTotp(secret, codePrev, { time: now, window: 1 }), true);
  assert.equal(verifyTotp(secret, codeNext, { time: now, window: 1 }), true);
});

test('verifyTotp rejects a code from too far in the past', () => {
  const secret = generateSecret();
  const now = Date.now();
  const old = totp(secret, { time: now - 5 * 30_000 });
  assert.equal(verifyTotp(secret, old, { time: now, window: 1 }), false);
});

test('verifyTotp rejects malformed input', () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, '', {}), false);
  assert.equal(verifyTotp(secret, 'abc', {}), false);
  assert.equal(verifyTotp(secret, '12345', {}), false);   // too short
  assert.equal(verifyTotp(secret, '1234567', {}), false); // too long
  assert.equal(verifyTotp('', '123456', {}), false);
});

test('verifyTotp rejects a wrong code', () => {
  const secret = generateSecret();
  const now = Date.now();
  const code = totp(secret, { time: now });
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  assert.equal(verifyTotp(secret, wrong, { time: now }), false);
});

test('otpauth URI has the fields an authenticator app needs', () => {
  const uri = otpauthUri({ secret: 'ABC234', label: 'jane@sowoccul.cm', issuer: 'SOWOCCUL' });
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=ABC234/);
  assert.match(uri, /issuer=SOWOCCUL/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

test('recovery codes are unique, formatted, and hash stably', () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10); // all unique
  for (const c of codes) assert.match(c, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  // Hash is stable regardless of case/dashes.
  const h1 = hashRecoveryCode('4F2A-9C71-8E3D');
  const h2 = hashRecoveryCode('4f2a9c718e3d');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64); // sha256 hex
});
