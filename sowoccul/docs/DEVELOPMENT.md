# Development, testing, and the hardening layer

This documents the developer-facing improvements added on top of the core app:
validation, money handling, logging, session revocation, migrations, rate
limiting, and the test suite. It's aimed at whoever maintains the code next.

## Running the tests

```bash
cd server
npm install          # first time
npm test             # runs node --test over test/*.test.js
```

The suite uses Node's built-in test runner — no extra framework. Pure-logic
tests (money, validation, rate limiting, titles) run anywhere. A couple of route
tests need `express` installed and are skipped automatically if it isn't; after
`npm install` they run too.

Tests live in `server/test/`. When you change behaviour, add or update a test in
the same PR. The money and validation modules especially should never regress —
they guard real balances.

## The pieces

### Validation (`src/lib/validate.js`)
A tiny, dependency-free schema validator. Use `validateBody(schema)` as route
middleware; it coerces and cleans input, drops unknown fields, and returns a
`{ error, fields }` 400 on failure. Example:

```js
router.post('/login', validateBody({
  username: v.string().trim().lower().min(1).max(120),
  password: v.string().min(1).max(200),
}), ah(async (req, res) => { /* req.body is clean here */ }));
```

### Money (`src/lib/money.js`)
All amounts are whole FCFA. `fromDb()` parses BIGINT-as-string from Postgres;
`fromUser()` validates user input; `add()`/`subtract()` guard the safe-integer
range. Every balance calculation goes through these — never do raw `Number(x)`
arithmetic on money again. If balances could ever exceed ~9 quadrillion francs,
switch this module to BigInt end to end; nothing else needs to change.

### Logging + errors (`src/lib/logger.js`, `src/middleware/context.js`)
Structured JSON logs, one object per line. Every request gets an id (returned as
`X-Request-Id`) and a completion log line with status and duration. `req.log`
is a request-scoped logger. The central `errorHandler` turns `userSafe` domain
errors into clean 4xx responses and everything else into a generic 500 (with the
request id) while logging the full error server-side. Set `LOG_LEVEL`
(debug|info|warn|error|silent).

### Session revocation (`src/middleware/auth.js`)
JWTs can't be un-signed, so each user has a `token_version`. It's embedded in the
token and checked against the database on every authenticated request. Bumping it
(`revokeSessions(userId)`) instantly invalidates all of that user's existing
tokens. Used by: password change (then a fresh token is issued for the current
device) and the `POST /api/auth/logout-everywhere` route. Removing a staff
account also drops their access immediately because the user row is gone.

### Rate limiting (`src/middleware/rate-limit.js`)
In-memory fixed-window limiter on `POST /login` (10 / 15 min per IP+username) and
`POST /register` (8 / hour per IP). Good enough for a single instance; when you
scale to multiple instances, move the counter to Redis — the interface maps
directly onto INCR + EXPIRE. See the comment in the file.

### Migrations (`scripts/migrate.mjs`, `migrations/`)
`initSchema()` still builds a fresh database. For evolving a live database over
time, use versioned migrations:

```bash
npm run migrate          # apply pending migrations
npm run migrate:status   # show applied vs pending
```

Each migration is `migrations/NNNN_description.mjs` exporting
`async function up(client)`. They run in order, in a transaction, and are
recorded in `schema_migrations` so they never run twice. Forward-only by design:
to undo, write a new migration; to recover from a bad one, restore from backup.

## What's still NOT done (deliberately)

These remain on the before-members list — they're security/product decisions,
not code cleanups:

- Two-factor auth for staff/admin
- Maker-checker (dual approval) on large transactions
- Email/phone verification + CAPTCHA on registration
- Real object storage for KYC documents and signatures
- Locking `audit_log` to insert-only at the database-permission level
- Independent security review and the COBAC/MINFI + data-protection compliance
  review

Don't let "we hardened the dev side" blur into "it's ready for members." It's
ready to run privately and to be built on safely.
