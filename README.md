# SOWOCCUL — SONEL Workers Credit Union

A full-stack web application for a credit union: a public marketing site plus a
member portal with account balances, transactions, transfers, loan tracking with
repayments from savings, a mobile-money deposit entry point (coming soon), and a
digitalized bilingual (EN/FR) loan application, alongside a staff/admin console
for reviewing loans and managing accounts.

> **Security note.** This is a working prototype with a real backend, real
> authentication (hashed passwords + JWT), and a real database. It is a solid
> foundation, **not** a certified banking system. It now runs on PostgreSQL with
> an append-only audit log, backup/restore scripts, and Render deployment
> runbooks for HTTPS and secrets. Before touching real member money you still
> need: rate limiting and brute-force protection, two-factor auth, penetration
> testing, and a formal compliance review. See "Going to production" below.

## Stack

- **Frontend:** React + Vite, React Router, plain CSS (SOWOCCUL design system)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (via `pg`), async connection pool. Works the same
  locally and on a managed host like Render.
- **Auth:** bcrypt password hashing + JWT session tokens, role-based access
  (member / staff / admin)

## Project layout

```
sowoccul/
  server/          Express API + PostgreSQL
    src/
      index.js         app entry (awaits schema init, then listens)
      db/              pg pool, async schema + seed
      lib/             async-handler, content, audit, statements, branches, titles
      middleware/      auth guards
      routes/          auth, accounts, transactions, loans, admin, me, content
    scripts/           backup.sh, restore.sh, restore-drill.sh, migrate-sqlite-to-pg.mjs
  docs/            deployment + HTTPS + backup runbooks (Render)
  client/          React single-page app
    src/
      pages/           screens (login, dashboard, loan form, admin, ...)
      components/       shared UI
      context/          auth state
      lib/              api client, i18n, formatting
```

## Quick start

You need **Node.js 18+** and a **PostgreSQL database** (local or hosted).

For local Postgres, create an empty database and note its URL, e.g.
`postgres://sowoccul:password@localhost:5432/sowoccul`.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env          # then edit .env:
                              #   DATABASE_URL  → your Postgres URL
                              #   JWT_SECRET    → a long random string
                              #   ADMIN_PASSWORD→ a strong first-admin password
ADMIN_PASSWORD="your-strong-password" npm run seed   # creates schema + ONE admin
npm run dev                   # starts API on http://localhost:4000
```

The server creates its tables automatically on first boot (and `seed` runs the
same schema init), so you don't run any manual migration on a fresh database.
Connecting to a local Postgres over plain TCP works without SSL; the app only
requires TLS for non-localhost databases. Set `DATABASE_SSL=false` if your local
setup needs it explicitly.

`npm run seed` creates only a single administrator account (from the `ADMIN_*`
values in `.env`) on a fresh, empty database. **No demo members, accounts,
transactions or loans are created.** Running it again will not duplicate the
admin. You then sign in as that admin and create your branches, staff and
members from the admin console (or members register themselves via
"Become a member").

### 2. Frontend (in a second terminal)

```bash
cd client
npm install
npm run dev       # starts the app on http://localhost:5173
```

Open http://localhost:5173.

## First login

There are **no built-in demo accounts.** The first and only account after
seeding is the administrator you defined in `.env`:

| Role  | Username             | Password                          |
|-------|----------------------|-----------------------------------|
| Admin | `ADMIN_USERNAME`     | `ADMIN_PASSWORD` (the one you set) |

Sign in with it, then set up everything else. If you ever want sample data in a
**staging** environment (not production), a reference demo seed is preserved at
`server/src/db/seed.demo.js.bak`.

## Editing website content (no code)

Team names, job postings and footer contact details are **managed from the
admin console** — no code editing. Sign in as an admin (or staff) and open
**Website content** in the sidebar. There you can:

- **Team** — type each person's name into their slot. A blank slot shows
  "To be announced" on the public Team page.
- **Careers** — add, edit or remove job postings (title, branch, full-time vs
  internship, description), and set the email that applications are sent to.
  With no postings, the public Careers page shows a "no openings" message.
- **Contact** — the address, phone, email and opening hours shown in the footer.

Changes are saved to the database and appear on the public site immediately.
Defaults live in `server/src/lib/content.js` and are only used until you first
save each section.

## Adding members

Two ways, both built in:

- **Members register themselves** via "Become a member" (flagged for staff review).
- **Staff create a member directly** from the admin console: Members →
  "Create a member". Enter their name, email (this becomes their username),
  branch and a temporary password to hand over. No bank accounts are opened
  automatically — open those from the member's profile.

All financial data (accounts, deposits, withdrawals, transfers, loans,
repayments) is entered through the running app — never edited in code.

## Roles and permissions

Every staff account is created with a **job title**. Titles are mostly labels —
edit rights are still granted per person — but they map to what the account can
do under the hood:

- **General Manager** — the single institution-wide super-staff (head office).
  Views and edits members and posts transactions in **every** branch. Only one.
- **Branch Manager** — bound to one branch, and is that branch's **guaranteed
  editor** (always has edit rights). One Branch Manager per branch.
- **Loans Officer / Cashier / Intern** — bound to one branch. View-only unless
  you grant edit rights. Besides the Branch Manager, **only one other** staff in
  a branch may hold edit rights at a time.
- **admin** — the technical owner; the only account that can create staff, edit
  website content, and manage branches. Full access.
- **member** — a customer; sees only their own accounts.

So within a branch, at most two people can alter member records: the Branch
Manager (always) plus one other staff member you choose. Everyone else in the
branch is view-only. Staff only ever see and act on their **own** branch;
moving a member between branches is a General-Manager/admin action.

Managing staff: **Admin → Staff & roles**. Pick a title when creating the
account; the branch and edit-rights controls appear or hide based on the title
(General Manager needs no branch; Branch Manager is auto-editor). Edit rights for
the other titles are a checkbox, capped at one per branch.

The rules live in `server/src/middleware/auth.js` (`canViewBranch`,
`canEditBranch`, `requireEditMember`) and `server/src/lib/titles.js`, and are
applied on every member-mutating route in `server/src/routes/admin.js`.

### A note on "adjustments"

On a member's account you can post several entry types: deposit, withdrawal,
repayment, disbursement, and **adjustment**. An adjustment is a manual balance
correction that isn't a normal customer transaction — for fixing a double-keyed
deposit, a missed fee, or a reconciliation discrepancy. A positive amount adds
and a negative one subtracts, and it's recorded under its own label so it stands
out in the audit trail (an adjustment can create money out of nothing, so it
should always be visible as such). Anyone with edit rights can post one.

## Audit log

Every sensitive action is recorded to an append-only `audit_log` table: sign-ins,
account entries, **adjustments** (logged under their own action so they're easy
to find), loan decisions, repayments, member creation/review/reassignment, and
all staff changes (create, edit-rights, remove). Each entry captures who did it
(name + role), what, the affected record, the branch, a readable summary, and a
timestamp. The log can be read at **Admin → Audit log** by the admin and the
General Manager; there is no route to edit or delete entries. The logic lives in
`server/src/lib/audit.js`.

## First-login password change

Staff and manager accounts are created by the admin with a temporary password.
Those accounts are flagged `must_change_password`, and on first sign-in the app
forces them to set their own password before they can do anything else — the
server rejects every other action (checked against the database, so a stale
token can't slip past) until the password is changed. Self-registered members
choose their own password and are never forced. Anyone can change their password
any time at **Change password** in the sidebar.

## Data protection & members' rights

The site has an admin-editable **Privacy Policy** and **Terms of Service**
(bilingual, under Admin → Website content → Legal pages; linked in the footer),
with a solid starting draft.

Members can exercise their rights over their own data at **My data**:

- **See** everything held about them — contact details, identity/KYC fields, and
  their accounts.
- **Correct** it. Low-risk contact details (phone) are editable directly by the
  member. Identity/KYC fields (name, email, ID/CNI, NIU, address, employer,
  profession) can't be self-edited; instead the member submits a **correction
  request** that lands in a branch-scoped staff queue (**Corrections**), where
  staff with edit rights apply or reject it. Every step is audited.

## Verifiable statements

Each time a member generates a statement, the system records exactly those
figures and stamps the printout with a **verification code** (e.g. `STMT-7F3A2C`)
and a **content fingerprint** (a SHA-256 hash of the canonical figures). Anyone
holding the printout can go to the public **Verify a statement** page, enter the
code, and see the certified member, period, closing balances and issue date. If
the numbers on a printout were altered, they won't match what the code returns.
The logic is in `server/src/lib/statements.js`.

Note: this proves a statement matches what the credit union issued; it is not a
cryptographic digital signature (which would need a certificate and key
management — a production/ops step). It's the practical, self-contained level of
integrity appropriate here.

## What works

- Public marketing landing page in the SONEL identity: cooperators (open to the
  public, not just SONEL staff), "Deductions at Source plus Express Savings",
  licensing (COBAC · MINFI · CEMAC · NCC), products and services, and the six
  branches with HQ in Limbe.
- Member login → dashboard with account balances, a loan-balance tile, and a
  full downloadable bank statement (PDF).
- **Branches:** at registration a member picks the branch closest to them
  (Bamenda, Limbe, Douala, Bafoussam, Ebolowa, Yaoundé — HQ Limbe). Members are
  grouped by branch in the staff console, which can filter by branch and
  reassign a member to another branch.
- **Registration ("Become a member"):** full bilingual form (individual /
  business) including NIU / taxpayer number and matricule, a required branch,
  passport-size photo and ID-card uploads, and a type-to-sign signature. Email
  becomes the username; password is hashed with bcrypt; the account is created
  active but flagged for staff review.
- **Loan application:** six-step bilingual form now collects NIU and matricule,
  and applies conditional rules — a co-obligor (with the amount they stand in
  for) is required above 2,000,000 XAF, and collateral-security evidence must be
  uploaded above 3,000,000 XAF.
- Internal transfers, loan balance with repayments deducted from savings, a
  member-set monthly deduction, and a mobile-money deposit entry point that
  shows "coming soon" and moves no money.
- Staff/admin console: review the loan queue (approve / reject), browse members
  grouped by branch with their outstanding balances, view any account, post
  credits/debits and loan repayments, reassign branches, and mark new
  registrations reviewed.

## Key API endpoints

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/register`,
  `GET /api/auth/branches`
- `GET /api/accounts`, `GET /api/accounts/:id/transactions`,
  `GET /api/accounts/statement`, `POST /api/accounts/transfer`
- `POST /api/loans` (apply), `GET /api/loans/mine`, `GET /api/loans/balance`,
  `PUT /api/loans/monthly-deduction`, `POST /api/loans/repay`,
  `POST /api/loans/deposit-intent`
- `GET /api/admin/loans`, `POST /api/admin/loans/:id/decision`
- `GET /api/admin/members?branch=`, `GET /api/admin/members/:id`,
  `POST /api/admin/accounts/:id/entry`, `POST /api/admin/members/:id/repay`,
  `POST /api/admin/members/:id/branch`, `POST /api/admin/members/:id/mark-reviewed`

## Note on uploads and signatures

In this build, the photo / ID-card / collateral uploads store the **file name**
and the signature stores the **typed name**, which is enough to demonstrate the
flow. A production deployment should upload the actual files via multipart to
object storage and keep a reference, and should treat the typed signature as an
e-signature record with an audit trail.

## Going to production (checklist)

Done in this build:

- [x] **PostgreSQL** data layer (async `pg` pool); `DATABASE_URL` comes from env
- [x] **Backups + tested restore** — `server/scripts/backup.sh`, `restore.sh`,
      and a `restore-drill.sh` that proves a backup restores (row-count check).
      See `docs/RUNBOOK-backups.md`.
- [x] **HTTPS** — free auto-TLS on Render, enforcement steps in
      `docs/RUNBOOK-https.md`. DB connections use TLS automatically.
- [x] **Secrets** in the host's secret store (Render env vars), not a `.env` on
      the server. See `docs/RUNBOOK-deploy-render.md`.
- [x] **Append-only audit log** for money movements and loan decisions.
- [x] SQLite→Postgres data migration script for existing deployments.
- [x] **Automated tests** (`npm test`) covering money, validation, rate limiting,
      the db transaction layer, and the transfer route. See `docs/DEVELOPMENT.md`.
- [x] **Input validation** at the route edge (`src/lib/validate.js`).
- [x] **Safe money handling** — whole-franc integers with range guards
      (`src/lib/money.js`); no floats touch balances.
- [x] **Structured logging + request ids + central error handling**.
- [x] **Session revocation** (token versioning): password change ends other
      sessions; `logout-everywhere` endpoint; removed staff lose access at once.
- [x] **Login/registration rate limiting** (brute-force protection).
- [x] **Versioned migration system** (`npm run migrate`).

Still to do before handling real member money:

- [ ] Multi-factor auth for staff/admin
- [ ] Maker-checker (dual approval) on large transactions
- [ ] Email/phone verification + CAPTCHA on registration
- [ ] Real file storage for KYC docs/signatures (object storage, not filenames)
- [ ] Lock the audit table to insert-only at the DB-permission level
- [ ] Independent security review / penetration test
- [ ] Regulatory/compliance review (COBAC/MINFI, Cameroon data protection)
