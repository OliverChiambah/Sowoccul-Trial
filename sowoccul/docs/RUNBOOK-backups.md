# Backups and tested restore (Render)

> A cooperative that loses its ledger is finished. Treat this runbook as
> non-optional. The rule here: **two independent backup mechanisms, and a restore
> you have actually tested.** A backup you've never restored is only a hope.

There are two layers, and you want both:

1. **Render's managed daily backups** — automatic, provider-side.
2. **Your own `pg_dump` backups** — independent copies you control, plus a drill
   that proves they restore.

---

## Layer 1 — Render managed backups

On a paid Render Postgres plan, Render takes **daily backups** and lets you do
point-in-time recovery within the retention window.

Set up / verify:

1. Open the Postgres instance in the Render dashboard → **Backups** (or
   **Recovery**) tab.
2. Confirm daily backups are enabled and note the **retention period**.
3. Read how Render's **restore / point-in-time recovery** works: it typically
   restores to a **new** database instance. You then repoint `DATABASE_URL` at the
   new instance. Practice this once (see the drill below) so you're not learning
   it during an incident.

This layer is great, but it's a single vendor and a single mechanism. Add layer 2.

---

## Layer 2 — Your own dumps (`scripts/backup.sh`)

`server/scripts/backup.sh` runs `pg_dump` in compressed custom format, verifies the
dump parses, and prunes old copies (keeps the newest 14 by default).

### Run it manually

```bash
cd server
DATABASE_URL='postgres://...external-url...' ./scripts/backup.sh ./backups
```

### Schedule it

Options, pick one:

- **Render Cron Job service** — New → Cron Job, root dir `server`, command
  `./scripts/backup.sh`, with `DATABASE_URL` set as a secret env var, schedule
  `15 2 * * *` (02:15 daily). Note: give it somewhere durable to write — a Render
  Disk, or better, push the dump to off-box storage (next point).
- **Off-box storage (recommended):** after `pg_dump`, upload the `.dump` to
  object storage in a *different* account/region (e.g. an S3-compatible bucket).
  This protects you if the whole Render account is lost or compromised. Add the
  upload step to a copy of `backup.sh`.

> Why off-box matters: backups sitting in the same account as the database die
> with the account. For a financial ledger, keep at least one copy somewhere the
> primary provider can't touch.

---

## The restore, and proving it works

### One-off restore (recovery)

`server/scripts/restore.sh` restores a dump into a target database. It uses a
separate `TARGET_DATABASE_URL` variable on purpose, so you can't accidentally
overwrite production from a stray `DATABASE_URL` in your shell.

```bash
cd server
TARGET_DATABASE_URL='postgres://...the-db-to-restore-into...' \
  ./scripts/restore.sh ./backups/sowoccul-20260706-021500Z.dump
```

Only ever point `TARGET_DATABASE_URL` at production when you are *deliberately*
recovering from data loss. Normal testing restores into a scratch database.

### The drill (`scripts/restore-drill.sh`) — run this regularly

This is the part people skip and regret. The drill takes a backup, restores it
into a throwaway scratch database, and compares row counts table-by-table with the
live database. If every count matches, you get **PASS**; otherwise **FAIL**.

```bash
cd server
DATABASE_URL='postgres://.../sowoccul' \
ADMIN_DATABASE_URL='postgres://.../postgres' \
  ./scripts/restore-drill.sh
```

- `DATABASE_URL` — the live db (used read-only here: dump + counts).
- `ADMIN_DATABASE_URL` — a connection that can `CREATE DATABASE`/`DROP DATABASE`
  on the same server (e.g. the maintenance `postgres` database). The scratch db is
  created and dropped through it.

On managed Render Postgres you may not be able to `CREATE DATABASE`. Two ways
around that:

- Run the drill against a **local Postgres of the same major version** — restore
  the production dump locally and check counts. Same confidence, no cloud perms.
- Or use Render's own **restore-to-new-instance** feature, then point
  `DATABASE_URL`/`TARGET_DATABASE_URL` at that fork and run the comparison portion.

Schedule the drill **weekly**. Finding out backups are broken should happen on a
quiet Tuesday, not during an outage.

---

## Recovery checklist (when the worst happens)

1. Stop writes if you can (put the API in maintenance / scale to zero) so you're
   not restoring onto a moving target.
2. Pick the most recent good backup — Render's managed backup or your latest
   `pg_dump`.
3. Restore into a **new** database (Render restore-to-new-instance, or a fresh db
   + `restore.sh`).
4. Verify: run `restore-drill`-style row-count checks, then log in and spot-check
   recent transactions and balances.
5. Repoint `DATABASE_URL` (Render env var) at the recovered database and bring the
   API back up.
6. Write down what happened and when — you'll want the timeline for members and
   regulators.

---

## Checklist

- [ ] Render managed daily backups enabled; retention period known.
- [ ] You've read how Render's restore/PITR works and tried it once.
- [ ] `backup.sh` scheduled daily (Render Cron or equivalent).
- [ ] At least one backup copy lands **off-box** (different account/region).
- [ ] `restore-drill.sh` scheduled weekly and last run **PASSED**.
- [ ] Recovery checklist printed and somewhere findable when systems are down.
