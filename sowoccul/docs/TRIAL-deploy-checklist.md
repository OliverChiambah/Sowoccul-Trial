# Trial deploy checklist (Render, free tier)

A short, ordered path to get SOWOCCUL running on Render's **free tier** so you can
check that everything builds, deploys, and works end-to-end. This is for testing
only — see "What a free trial is not" at the bottom.

Do the steps in order. Each one tells you how to know it worked before moving on.

---

## Before you start

- [ ] The project is in a **GitHub** (or GitLab) repository you control.
- [ ] You have a free **Render** account (sign up with the same GitHub account).
- [ ] Decide now: **are you testing member signup (needs email), or just the
      internal app (admin/staff)?** For a first pass, do the internal app — it
      needs no email provider. You can add email in a second pass.

---

## Step 1 — Use the free blueprint

Render reads a file named `render.yaml` by default. This repo has two:

- `render.yaml` — paid tiers, for a real launch.
- `render.free.yaml` — free tiers, for this trial.

Do **one** of these:

- [ ] **Simplest:** rename `render.free.yaml` to `render.yaml` (rename the old
      paid one to `render.paid.yaml` first so you keep it), commit, and push.
- [ ] **Or:** keep the files as they are and, in Render, point the Blueprint at
      `render.free.yaml` when it asks which file to use.

---

## Step 2 — Create the Blueprint on Render

- [ ] In Render: **New → Blueprint**.
- [ ] Connect your repo. Render reads the blueprint and shows the three things it
      will create: `sowoccul-db`, `sowoccul-api`, `sowoccul-web`.
- [ ] It will prompt you for the values marked `sync:false`. Fill in the
      **admin** ones now (leave the email ones blank for the internal-app trial):
  - `ADMIN_USERNAME` — e.g. `admin`
  - `ADMIN_PASSWORD` — a **strong** password (8+ chars); you'll change it after.
  - `ADMIN_FULL_NAME` — e.g. `System Administrator`
  - `ADMIN_EMAIL` — any address you control
  - `ADMIN_BRANCH` — e.g. `Limbe`
  - `CLIENT_ORIGIN` — leave blank for now; you'll set it in Step 5.
- [ ] Click **Apply**. Render starts building all three.

**How to know it worked:** the API and web services reach a "Live" state, and the
database shows "Available." First build takes a few minutes. If a build **fails**,
open its logs — this is exactly what the trial is for; a missing dependency or
build error shows up here. Fix, commit, push; Render rebuilds automatically.

---

## Step 3 — Seed the first admin

The database starts empty. Create your first login:

- [ ] Open the **sowoccul-api** service → **Shell** tab.
- [ ] Run: `npm run seed`
- [ ] It reads the `ADMIN_*` values from the environment and creates the admin.

**How to know it worked:** the command prints a success line (an admin was
created). If it says the admin already exists, that's fine — it's idempotent.

---

## Step 4 — Confirm the API URL and fix the rewrite if needed

Render usually names the API `https://sowoccul-api.onrender.com`, but if that name
was taken it adds a suffix.

- [ ] Open the **sowoccul-api** service and copy its real URL from the top.
- [ ] If it is **not** exactly `https://sowoccul-api.onrender.com`, edit
      `render.free.yaml` (or `render.yaml` if you renamed it): change the web
      service's rewrite `destination` to `<your-real-api-url>/api/*`. Commit and
      push; Render redeploys the web service.

**How to know it worked:** visiting `<your-api-url>/api/health` in a browser
returns `{ "ok": true }`.

---

## Step 5 — Point the app parts at each other

- [ ] Copy the **sowoccul-web** service's real URL (e.g.
      `https://sowoccul-web.onrender.com`).
- [ ] On the **sowoccul-api** service, set `CLIENT_ORIGIN` to that web URL and
      save (the API restarts).

**How to know it worked:** no CORS errors in the browser console when you use the
app (next step).

---

## Step 6 — Sign in and click through

- [ ] Open the **web** URL. (First load may take ~30–60s while the free API wakes
      up — that's the free-tier sleep, not a bug.)
- [ ] Sign in with the admin username/password from Step 2.
- [ ] **Change the admin password immediately** (Security/Profile).
- [ ] Create a test **staff** member and a test **branch** if needed.
- [ ] As staff, post a test deposit/withdrawal; check the member's statement.
- [ ] As the General Manager account, open the Audit page and confirm the
      **"Books balanced"** banner shows (the ledger reconciliation).

**How to know it worked:** you can move test money and see it reflected in
balances, statements, and the reconciliation banner.

---

## Step 7 (optional) — Test member signup + email verification

Only if you want to test the public signup flow. This needs a real email service.

- [ ] Set up an account with an email provider (SMTP or a transactional email
      API). See `RUNBOOK-deploy-render.md` sections 6–7 for the exact variables.
- [ ] On **sowoccul-api**, set `EMAIL_PROVIDER` and its settings, `EMAIL_FROM`,
      and `PUBLIC_APP_URL` (= your web URL).
- [ ] If you chose the **SMTP** path: add `nodemailer` to the server first —
      `cd server && npm install nodemailer`, commit, push — or SMTP will error.
- [ ] Add SPF/DKIM/DMARC DNS records for your sending domain (your provider gives
      you these) so the emails don't land in spam.

**How to know it worked:** register a new member with a **real** email address,
receive the verification email (check spam too), click the link **or** type the
6-digit code, then successfully sign in as that member.

---

## What a free trial is NOT

Be clear-eyed about this so the trial tells you the right things:

- **Not a performance test.** Free tiers throttle CPU/RAM and the API sleeps when
  idle. Judge whether the app *works*, not how fast it feels.
- **Not durable.** Free Postgres is small, has **no managed backups**, and may
  **expire** after a limited period. Treat all trial data as disposable.
- **Not for real members or real money.** No regulatory clearance, no backups, no
  independent security review — those come before a real launch. See
  `LAUNCH-checklist.md`.

When the trial looks good, move to the paid `render.yaml` (real database with
backups, always-on services) and work through `LAUNCH-checklist.md` before any
real member or real franc is involved.
