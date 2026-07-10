import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twofaRequiredForRole, twofaHardForced, REQUIRE_2FA_LEVELS, memberGraceStatus, MEMBER_GRACE_DAYS } from '../src/lib/settings.js';

test("level 'off' requires 2FA of nobody", () => {
  for (const role of ['admin', 'manager', 'staff', 'member']) {
    assert.equal(twofaRequiredForRole(role, 'off'), false);
    assert.equal(twofaHardForced(role, 'off'), false);
  }
});

test("level 'staff' requires 2FA of staff/manager/admin but not members", () => {
  assert.equal(twofaRequiredForRole('admin', 'staff'), true);
  assert.equal(twofaRequiredForRole('manager', 'staff'), true);
  assert.equal(twofaRequiredForRole('staff', 'staff'), true);
  assert.equal(twofaRequiredForRole('member', 'staff'), false);
});

test("level 'all' requires 2FA of everyone", () => {
  for (const role of ['admin', 'manager', 'staff', 'member']) {
    assert.equal(twofaRequiredForRole(role, 'all'), true);
  }
});

test('members are never hard-forced (grace prompt), staff always are when required', () => {
  // Under 'all', members are required but only softly (not hard-forced).
  assert.equal(twofaRequiredForRole('member', 'all'), true);
  assert.equal(twofaHardForced('member', 'all'), false);
  // Staff/admin are hard-forced whenever required.
  assert.equal(twofaHardForced('staff', 'staff'), true);
  assert.equal(twofaHardForced('admin', 'all'), true);
  assert.equal(twofaHardForced('manager', 'staff'), true);
});

test('the three levels are the known set', () => {
  assert.deepEqual(REQUIRE_2FA_LEVELS, ['off', 'staff', 'all']);
});

test('the member grace period is 10 days', () => {
  assert.equal(MEMBER_GRACE_DAYS, 10);
});

test('grace status counts down and expires after 10 days', () => {
  const since = new Date('2026-01-01T00:00:00Z').toISOString();
  // Day 0: 10 days remaining, not expired
  let g = memberGraceStatus('all', since, new Date('2026-01-01T00:00:00Z').getTime());
  assert.equal(g.active, true);
  assert.equal(g.days_remaining, 10);
  assert.equal(g.expired, false);
  // Day 3: 7 remaining
  g = memberGraceStatus('all', since, new Date('2026-01-04T00:00:00Z').getTime());
  assert.equal(g.days_remaining, 7);
  assert.equal(g.expired, false);
  // Day 10: expired
  g = memberGraceStatus('all', since, new Date('2026-01-11T00:00:00Z').getTime());
  assert.equal(g.expired, true);
  assert.equal(g.days_remaining, 0);
});

test('grace is inactive when level is not "all" or no start recorded', () => {
  assert.equal(memberGraceStatus('staff', new Date().toISOString()).active, false);
  assert.equal(memberGraceStatus('all', null).active, false);
});

test('a member is soft during grace, hard-forced after it expires', () => {
  // during grace (graceExpired = false)
  assert.equal(twofaHardForced('member', 'all', false), false);
  // after grace (graceExpired = true)
  assert.equal(twofaHardForced('member', 'all', true), true);
  // staff ignore grace entirely — always hard-forced when required
  assert.equal(twofaHardForced('staff', 'staff', false), true);
});
