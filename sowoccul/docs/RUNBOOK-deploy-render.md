# Deploying SOWOCCUL on Render (with secrets, not `.env` files)

This is a step-by-step runbook for putting the credit union app into production on
[Render](https://render.com). It covers the database, the API, the frontend, and —
importantly — keeping secrets in Render's secret store rather than in a `.env`
file sitting on the server.

> These are operational instructions, not code. You run them once in Render's
> dashboard. Screenshots/labels may shift as Render updates its UI; the concepts
> (managed Postgres, environment variables/secret files, auto-TLS) are stable.

---

## 0. What you're deploying

Three pieces:

| Piece      | What it is                    | Render service type            |
|------------|-------------------------------|--------------------------------|
| Database   | PostgreSQL                    | **Render Postgres** (managed)  |
| API        | Node/Express (`server/`)      | **Web Service**                |
| Frontend   | React/Vite static build (`client/`) | **Static Site**          |

Rough cost at the time of writing: Starter Web Service ~$7/mo + Postgres ~$7/mo.
The static site is free. Confirm current prices on Render's pricing page.

---

## 1. Create the managed Postgres database

1. Render Dashboard → **New** → **Postgres**.
2. Name it (e.g. `sowoccul-db`), pick the region closest to your users, choose a
   plan (the smallest paid plan gives you daily backups — see the backup runbook).
3. Create it. When it's ready, open it and copy the **Internal Database URL**.
   - Use the **Internal** URL for the API (same-region, faster, not exposed to the
     internet).
   - The **External** URL is only for connecting from your laptop for admin tasks.
4. Managed Postgres on Render requires TLS. Our app enables SSL automatically for
   any non-localhost `DATABASE_URL`, so nothing to configure in code.

---

## 2. Deploy the API as a Web Service

1. Push this repo to GitHub/GitLab.
2. Render Dashboard → **New** → **Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. Do **not** commit a `.env`. Instead add environment variables in the next step.

### 2a. Secrets — the important part

Never put `JWT_SECRET`, `DATABASE_URL`, or admin credentials in a file on the
server or in the repo. Put them in Render's **Environment** tab, which is an
encrypted secret store injected at runtime.

On the Web Service → **Environment** → **Add Environment Variable**:

| Key              | Value                                                        |
|------------------|-------------------------------------------------------------|
| `DATABASE_URL`   | *(paste the Internal Database URL from step 1)*             |
| `JWT_SECRET`     | *(a long random string — generate it, see below)*          |
| `JWT_EXPIRES_IN` | `8h`                                                        |
| `CLIENT_ORIGIN`  | *(your frontend URL, e.g. `https://app.sowoccul.cm`)*      |
| `PG_POOL_MAX`    | `10`                                                        |
| `NODE_VERSION`   | `20` *(or your target LTS)*                                 |

Generate a strong `JWT_SECRET` locally and paste the output:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Render also supports **Secret Files** (Environment → Secret Files) if you ever
need to mount a file (e.g. a CA cert). For this app, environment variables are
enough.

> Tip: mark the service **auto-deploy on push** so shipping a fix is just a git
> push. For the database migration/seed you'll run one-off commands (below).

### 2b. First-time database setup

The API runs `initSchema()` on boot, so the tables are created automatically the
first time it starts. You still need a first admin user.

Use Render's **Shell** (on the Web Service) or a one-off job, with the admin
variables set, and run the seed:

```bash
# In the Render shell for the API service:
ADMIN_USERNAME=admin \
ADMIN_PASSWORD='choose-a-strong-one' \
ADMIN_FULL_NAME='System Administrator' \
ADMIN_EMAIL='admin@sowoccul.cm' \
ADMIN_BRANCH='Limbe' \
npm run seed
```

Then sign in and change that password immediately (the app also supports forced
first-login password change for staff you create).

If you're migrating an existing SQLite deployment, see
`server/scripts/migrate-sqlite-to-pg.mjs` and run `npm run migrate:sqlite` once,
with `SQLITE_FILE` and `DATABASE_URL` set.

---

## 3. Deploy the frontend as a Static Site

1. Render Dashboard → **New** → **Static Site** → same repo.
2. Settings:
   - **Root Directory:** `client`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. The frontend calls the API at `/api`. Point it at the API service URL by
   setting the API base (via a Vite env var such as `VITE_API_BASE`) or by adding
   a Render **Redirect/Rewrite** rule that proxies `/api/*` to the Web Service.
4. Add the Static Site's URL to the API's `CLIENT_ORIGIN` variable (step 2a) so
   CORS allows it.

---

## 4. Custom domain

1. On the Static Site (and/or API) → **Settings** → **Custom Domains** → add your
   domain (e.g. `app.sowoccul.cm`).
2. Add the DNS records Render shows you at your registrar. If you bought a `.cm`
   domain locally (e.g. via MTN), add the CNAME/A records in that panel.
3. TLS is automatic — see `RUNBOOK-https.md`.

---

## 5. Post-deploy checklist

- [ ] `GET /api/health` returns `{ ok: true }` over **https**.
- [ ] You can log in as the admin and the password has been changed.
- [ ] `JWT_SECRET` is a fresh random value, not the example placeholder.
- [ ] `DATABASE_URL` uses the **Internal** URL, TLS implied.
- [ ] Daily managed backups are on (see `RUNBOOK-backups.md`) **and** your own
      `backup.sh` cron is scheduled.
- [ ] You have run the restore drill at least once and it PASSED.
- [ ] No `.env` file with real secrets is committed anywhere (check `.gitignore`).

---

## 6. Email notifications

The app queues an email to a member when money moves on their account, when a
loan decision is made, and on security events (e.g. a 2FA reset). Emails are
written to a `notifications` outbox table first, then a background worker
delivers them every ~20 seconds and retries failures. This means nothing is lost
if the email service is briefly down, and there is an auditable record of what
was sent.

### Choosing a provider (environment variables)

By default `EMAIL_PROVIDER=mock` — the app logs each email but sends nothing.
This is safe for testing. To send real email, set these on the **server** service:

**Option A — SMTP** (works with most email hosts):

    EMAIL_PROVIDER=smtp
    EMAIL_FROM=SOWOCCUL <noreply@sowoccul.cm>
    EMAIL_SMTP_HOST=smtp.yourhost.com
    EMAIL_SMTP_PORT=587
    EMAIL_SMTP_SECURE=false        # true if the host requires TLS on connect (port 465)
    EMAIL_SMTP_USER=your-smtp-username
    EMAIL_SMTP_PASS=your-smtp-password

  SMTP requires the `nodemailer` package. Add it once: `npm install nodemailer`
  in the `server` folder and commit the lockfile change.

**Option B — HTTP API** (a transactional email service):

    EMAIL_PROVIDER=http
    EMAIL_FROM=SOWOCCUL <noreply@sowoccul.cm>
    EMAIL_HTTP_URL=https://api.youremailservice.com/v1/send
    EMAIL_HTTP_AUTH=Bearer YOUR_API_KEY

  The generic HTTP sender posts `{ from, to, subject, text }`. Adapt the field
  names/headers in `server/src/lib/mailer.js` to match your provider's API.

### Notes

- **Deliverability:** to keep emails out of spam, set up SPF, DKIM and DMARC DNS
  records for `sowoccul.cm` with whichever provider you choose. This is a DNS
  task, done once.
- **Worker interval:** `NOTIFY_INTERVAL_MS` (default 20000). Set to `0` to
  disable the in-process worker (e.g. if you later run a separate worker).
- **Multiple server instances:** the worker runs in-process. If you scale to more
  than one instance, run the worker on only one (or move to a real queue) so an
  email isn't sent twice.
- **Members can opt out** of non-essential emails on their Profile page. Security
  alerts are always sent regardless of that setting.
- **SMS later:** the `notifications` table has a `channel` column and the sender
  is behind one interface, so SMS can be added the same way without reworking the
  triggers.

---

## 7. Email verification at signup

New members must confirm their email address before they can sign in. On
registration the app creates the account (unverified), emails a confirmation
**link** and a **6-digit code**, and does **not** log the person in. They confirm
by clicking the link or entering the code on the `/verify-email` page; only then
can they sign in. Staff and admin accounts are created internally and are exempt.

Security properties (already built in): the link token is 32 random bytes; only
SHA-256 hashes of the token and code are stored; both expire after 24 hours; the
code locks after 5 wrong attempts; resend is rate-limited and does not reveal
whether an email is registered.

### Required environment variable

Set this on the **server** service so the emailed link points at your real site:

    PUBLIC_APP_URL=https://app.sowoccul.cm

The confirmation link is built as `${PUBLIC_APP_URL}/verify-email?token=…`. If it
is unset the link path is still correct but relative — set it in production so the
emailed link is clickable.

Email delivery itself uses the same provider you configured in section 6. Until a
real provider is set (`EMAIL_PROVIDER=mock`), verification emails are logged, not
sent — so on the mock provider you won't receive the code by email. For a
production dry-run, configure a real email provider first, then register a test
member and confirm the email arrives and verification works end-to-end.
