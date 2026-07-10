import crypto from 'crypto';
import { db } from '../db/index.js';

/**
 * Builds a canonical, stable string from the parts of a statement that must not
 * change, and hashes it. Two statements with the same figures always produce the
 * same hash; any tampering with amounts or balances changes it.
 */
export function statementHash({ userId, fullName, periodFrom, periodTo, accounts, transactions }) {
  const canonicalAccounts = (accounts || [])
    .map((a) => `${a.account_number}:${a.type}:${a.balance}`)
    .sort()
    .join('|');
  const canonicalTx = (transactions || [])
    .map((t) => `${t.id}:${t.account_number}:${t.amount}:${t.balance_after}:${t.kind}:${t.created_at}`)
    .sort()
    .join('|');
  const payload = [
    `user=${userId}`,
    `name=${fullName}`,
    `from=${periodFrom || ''}`,
    `to=${periodTo || ''}`,
    `accounts=${canonicalAccounts}`,
    `tx=${canonicalTx}`,
  ].join('\n');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** A short, readable, unique statement code like STMT-7F3A2C. */
function makeCode() {
  return 'STMT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Records an issued statement so it can later be verified, and returns the
 * verification code + hash to print on the document. The `summary` snapshot is
 * stored so a verifier can be shown the closing balances that were certified.
 */
export async function issueStatement({ userId, fullName, periodFrom, periodTo, accounts, transactions }) {
  const content_hash = statementHash({ userId, fullName, periodFrom, periodTo, accounts, transactions });
  let code = makeCode();
  // Vanishingly unlikely, but guarantee uniqueness.
  for (let i = 0; i < 5; i += 1) {
    const clash = await db.one('SELECT 1 FROM issued_statements WHERE code = $1', [code]);
    if (!clash) break;
    code = makeCode();
  }
  const summary = {
    full_name: fullName,
    period_from: periodFrom || null,
    period_to: periodTo || null,
    accounts: (accounts || []).map((a) => ({ account_number: a.account_number, type: a.type, balance: a.balance })),
    transaction_count: (transactions || []).length,
  };
  await db.run(`
    INSERT INTO issued_statements (code, user_id, period_from, period_to, content_hash, summary)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [code, userId, periodFrom || null, periodTo || null, content_hash, JSON.stringify(summary)]);
  return { code, content_hash };
}

/** Look up an issued statement by its code, for the public verify page. */
export async function verifyStatement(code) {
  const row = await db.one('SELECT code, content_hash, summary, created_at FROM issued_statements WHERE code = $1', [String(code || '').trim().toUpperCase()]);
  if (!row) return null;
  let summary = {};
  try { summary = JSON.parse(row.summary); } catch { summary = {}; }
  return { code: row.code, content_hash: row.content_hash, created_at: row.created_at, summary };
}
