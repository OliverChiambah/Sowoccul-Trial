# SOWOCCUL — Architecture notes

## Shape of the system

```
Browser (React SPA)  ──HTTP/JSON──►  Express API  ──►  PostgreSQL (pg pool, TLS)
      │                                   │
   JWT in                            bcrypt hashes,
 Authorization                      role checks, atomic
    header                          money transactions
```

The frontend never talks to the database directly. Every balance, transaction
and loan lives on the server; the browser only holds a short-lived session
token. This is the key property that makes it safe-ish to reason about: the
client cannot invent a balance.

### Data access layer

All queries go through a small async helper in `server/src/db/index.js`
(`db.one` / `db.all` / `db.run` / `db.tx`) backed by a `pg.Pool`. Every route
handler is async and wrapped with `ah()` (`lib/async-handler.js`) so a rejected
promise is forwarded to Express's error handler instead of hanging the request.
`db.tx()` runs a function on a single pooled client inside
`BEGIN`/`COMMIT`/`ROLLBACK`, which is how transfers and other multi-write
operations stay atomic. TLS to the database is on automatically for any
non-localhost `DATABASE_URL`.

## Roles

- **member** — sees only their own accounts, transactions and loans; can
  transfer between their own accounts and apply for loans.
- **staff** — operational roles that run member money. With edit rights they
  post entries and handle loans within their branch. A staff member whose
  `title` is `branch_manager` can approve large transactions for their branch.
- **manager** (General Manager) — the top operational authority: views and edits
  member money across every branch, and approves large transactions anywhere.
- **admin** (System / IT administrator) — a **technical role, deliberately
  separated from member money**. The admin manages staff accounts, 2FA policy,
  the approval threshold, website content, branches, and can view the audit log —
  but is **blocked from all member financial data and money actions**: cannot
  post entries, cannot approve pending transactions, and cannot view member
  accounts, transactions, or the approvals queue.

This separation is a governance control (segregation of duties): whoever runs
the technology is not also moving members' money. It is enforced in three
places — `lib/permissions.js` (`canViewBranch`/`canEditBranch` exclude admin),
`lib/maker-checker.js` (`canApprovePending` excludes admin), and the
`blockFinancialAdmin` guard applied to money/member routes in `routes/admin.js`.

Access is enforced server-side in `middleware/auth.js` (`requireAuth`,
`requireRole`, `blockFinancialAdmin`) and the pure policy in `lib/permissions.js`.
The frontend hides links it shouldn't show, but that is convenience only — the
server is the real gate.

## Data model

- **users** — login + profile + role.
- **accounts** — belong to a user; hold a balance in whole FCFA.
- **transactions** — append-only ledger lines. Each row records the amount
  (positive = credit, negative = debit) and the resulting `balance_after`, so
  history is self-describing. Transfers write two linked rows in one DB
  transaction.
- **loan_applications** — the full submitted form is stored as JSON in
  `payload`; `amount`, `purpose`, `status` are pulled out for listing and
  filtering. Decisions record who decided and when.

## Money movements are atomic

Every money movement — internal transfers (`routes/accounts.js`), admin entries
and approvals (`routes/admin.js`), and loan repayments (`routes/loans.js`) — goes
through **one** function, `postToAccount()` in `lib/post-money.js`, inside a
`db.tx(...)`. In a single atomic transaction it:

1. **Locks the account row** (`SELECT … FOR UPDATE`) so two concurrent movements
   on the same account can't read-modify-write over each other (no lost updates,
   no money created or destroyed by a race).
2. Updates the cached `accounts.balance`.
3. Inserts the member-facing `transactions` row (`balance_after`).
4. Posts a **balanced double-entry** journal (`lib/ledger.js`).

Because all four share one transaction, they commit or roll back together — the
cached balance and the ledger can never drift apart.

## Double-entry ledger

`lib/ledger.js` maintains a real set of books alongside the cached balances.
Every movement writes a journal entry whose debit and credit lines sum to exactly
zero; `postEntry()` refuses to write an unbalanced entry. A member's savings is a
**liability** of the cooperative, mapped to a per-account liability sub-account so
the ledger can be reconciled per member account.

Two checks prove integrity, exposed at `GET /api/admin/ledger/reconcile` (GM
only):

- **Trial balance** — the sum of *all* ledger lines must be zero.
- **Reconciliation** — each account's ledger balance must equal its cached
  `accounts.balance`; any mismatch is reported per account.

On first deploy, `backfillOpeningBalances()` posts each existing balance as an
opening entry (against equity) so the ledger starts in sync. It is idempotent and
runs at startup.

## Idempotency

Money-moving endpoints (transfer, loan repayment) accept an `Idempotency-Key`
header (or `idempotency_key` body field). `lib/idempotency.js` records the first
result and replays it on any retry with the same key — so a timeout, double-tap,
or re-delivered payment webhook can't move money twice. No key → normal behaviour,
so existing clients are unaffected; the protection is there the moment mobile
money or a mobile app wants it.

## Where the future "deposit" feature plugs in

The admin "post an entry" endpoint (`POST /api/admin/accounts/:id/entry`)
already does real, audited credits and debits through `postToAccount()`. A
member-facing deposit flow (mobile money, cash-in at a branch, etc.) becomes:
take the external payment, then call this same function to credit the account —
with an idempotency key from the payment provider's reference. Keep the ledger as
the single source of truth and layer payment providers on top.

## What to harden before real money

See the checklist at the bottom of `README.md`. The two most important:
move to Postgres, and put an append-only audit log behind every money movement
and loan decision.
