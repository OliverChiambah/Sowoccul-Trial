import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../src/middleware/rate-limit.js';

function mkReqRes(ip = '1.2.3.4', body = {}) {
  const headers = {};
  const req = { ip, body, path: '/x', headers: {}, socket: {} };
  const res = {
    statusCode: 200,
    _headers: headers,
    _json: null,
    setHeader(k, val) { headers[k.toLowerCase()] = val; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this._json = o; return this; },
  };
  return { req, res };
}

test('allows requests under the limit', () => {
  const mw = rateLimit({ windowMs: 1000, max: 3, name: 't1' });
  let called = 0;
  for (let i = 0; i < 3; i++) {
    const { req, res } = mkReqRes();
    mw(req, res, () => called++);
  }
  assert.equal(called, 3);
});

test('blocks the request over the limit with 429', () => {
  const mw = rateLimit({ windowMs: 1000, max: 2, name: 't2' });
  let called = 0;
  let last;
  for (let i = 0; i < 3; i++) {
    const { req, res } = mkReqRes('9.9.9.9');
    mw(req, res, () => called++);
    last = res;
  }
  assert.equal(called, 2);
  assert.equal(last.statusCode, 429);
  assert.match(last._json.error, /Too many attempts/);
  assert.ok(last._headers['retry-after']);
});

test('separate IPs have separate buckets', () => {
  const mw = rateLimit({ windowMs: 1000, max: 1, name: 't3' });
  let called = 0;
  const a = mkReqRes('1.1.1.1'); mw(a.req, a.res, () => called++);
  const b = mkReqRes('2.2.2.2'); mw(b.req, b.res, () => called++);
  assert.equal(called, 2); // both allowed, different IPs
});

test('keyBy separates by body field', () => {
  const mw = rateLimit({ windowMs: 1000, max: 1, keyBy: 'username', name: 't4' });
  let called = 0;
  const a = mkReqRes('5.5.5.5', { username: 'alice' }); mw(a.req, a.res, () => called++);
  const b = mkReqRes('5.5.5.5', { username: 'bob' }); mw(b.req, b.res, () => called++);
  assert.equal(called, 2); // same IP, different usernames → separate buckets
});

test('sets rate limit headers', () => {
  const mw = rateLimit({ windowMs: 1000, max: 5, name: 't5' });
  const { req, res } = mkReqRes();
  mw(req, res, () => {});
  assert.equal(res._headers['x-ratelimit-limit'], '5');
  assert.equal(res._headers['x-ratelimit-remaining'], '4');
});
