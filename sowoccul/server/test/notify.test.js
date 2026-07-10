import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../src/db/index.js';
import { enqueueEmail, drainOutbox } from '../src/lib/notify.js';
import { mockOutbox } from '../src/lib/mailer.js';

// A tiny in-memory fake of the pieces of the pg pool that notify.js touches.
// It stores "users" and "notifications" rows and answers the specific queries.
function makeFakePool({ users }) {
  const notifications = [];
  let nextId = 1;
  return {
    notifications,
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();
      // enqueueEmail: load the recipient user
      if (s.startsWith('SELECT id, full_name, email, languages, notify_email FROM users')) {
        const u = users.find((x) => x.id === params[0]);
        return { rows: u ? [u] : [] };
      }
      // enqueueEmail: insert a notification
      if (s.startsWith('INSERT INTO notifications')) {
        const row = {
          id: nextId++, user_id: params[0], recipient: params[1], event: params[2],
          subject: params[3], body: params[4], lang: params[5], important: params[6],
          status: 'pending', attempts: 0,
        };
        notifications.push(row);
        return { rows: [{ id: row.id }] };
      }
      // drainOutbox: fetch pending
      if (s.startsWith("SELECT id, recipient, subject, body, attempts FROM notifications WHERE status = 'pending'")) {
        return { rows: notifications.filter((n) => n.status === 'pending').slice(0, params[0]) };
      }
      // drainOutbox: mark sent
      if (s.includes("SET status = 'sent'")) {
        const n = notifications.find((x) => x.id === params[0]);
        if (n) { n.status = 'sent'; n.attempts += 1; }
        return { rows: [] };
      }
      // drainOutbox: mark failed/retry
      if (s.startsWith('UPDATE notifications SET status = $2')) {
        const n = notifications.find((x) => x.id === params[0]);
        if (n) { n.status = params[1]; n.attempts = params[2]; n.last_error = params[3]; }
        return { rows: [] };
      }
      throw new Error('Unexpected SQL in fake pool: ' + s.slice(0, 80));
    },
  };
}

test('enqueue renders a bilingual transaction email and stores it pending', async () => {
  const pool = makeFakePool({ users: [
    { id: 1, full_name: 'Paul Ndongo', email: 'paul@example.cm', languages: 'English', notify_email: 1 },
  ] });
  __setPoolForTests(pool);
  const id = await enqueueEmail({ userId: 1, event: 'transaction', data: {
    credit: true, amount: 50000, account: 'SWC-100', balance: 150000, when: '2026-07-08 10:00',
  } });
  assert.ok(id, 'should return a row id');
  const row = pool.notifications[0];
  assert.equal(row.status, 'pending');
  assert.match(row.subject, /deposit/i);
  assert.match(row.body, /50[\s,.]?000 FCFA/);
  assert.match(row.body, /New balance/);
});

test('French member gets the French template', async () => {
  const pool = makeFakePool({ users: [
    { id: 2, full_name: 'Marie Claire', email: 'marie@example.cm', languages: 'French', notify_email: 1 },
  ] });
  __setPoolForTests(pool);
  await enqueueEmail({ userId: 2, event: 'transaction', data: {
    credit: false, amount: 20000, account: 'SWC-200', balance: 5000, when: '2026-07-08 11:00',
  } });
  assert.match(pool.notifications[0].subject, /retrait/i);
  assert.match(pool.notifications[0].body, /Nouveau solde/);
});

test('opted-out member gets NO non-essential email', async () => {
  const pool = makeFakePool({ users: [
    { id: 3, full_name: 'Opt Out', email: 'out@example.cm', languages: 'English', notify_email: 0 },
  ] });
  __setPoolForTests(pool);
  const id = await enqueueEmail({ userId: 3, event: 'transaction', data: {
    credit: true, amount: 1000, account: 'SWC-300', balance: 1000, when: 'now',
  } });
  assert.equal(id, null);
  assert.equal(pool.notifications.length, 0);
});

test('security emails are sent even to opted-out members', async () => {
  const pool = makeFakePool({ users: [
    { id: 4, full_name: 'Opt Out', email: 'out@example.cm', languages: 'English', notify_email: 0 },
  ] });
  __setPoolForTests(pool);
  const id = await enqueueEmail({ userId: 4, event: 'security', important: true, data: {
    title: 'Password changed', message: 'Your password was changed.',
  } });
  assert.ok(id, 'security email should still be queued');
  assert.equal(pool.notifications[0].important, 1);
});

test('a member with no email address is skipped', async () => {
  const pool = makeFakePool({ users: [
    { id: 5, full_name: 'No Email', email: null, languages: 'English', notify_email: 1 },
  ] });
  __setPoolForTests(pool);
  const id = await enqueueEmail({ userId: 5, event: 'transaction', data: { credit: true, amount: 1, account: 'x', balance: 1, when: 'now' } });
  assert.equal(id, null);
});

test('drainOutbox delivers pending mail and marks it sent', async () => {
  const pool = makeFakePool({ users: [
    { id: 6, full_name: 'Send Me', email: 'send@example.cm', languages: 'English', notify_email: 1 },
  ] });
  __setPoolForTests(pool);
  mockOutbox.length = 0;
  await enqueueEmail({ userId: 6, event: 'loan_decision', data: { approved: true, reference: 'LN-9', amount: 300000, note: '' } });
  const before = pool.notifications[0].status;
  const summary = await drainOutbox();
  assert.equal(before, 'pending');
  assert.equal(pool.notifications[0].status, 'sent');
  assert.equal(summary.sent, 1);
  // the mock "sent" it — inspect what would have gone out
  assert.match(mockOutbox.at(-1).subject, /approved/i);
});
