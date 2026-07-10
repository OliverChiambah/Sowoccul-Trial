# Closed-launch checklist (Render Blueprint)

Follow this once, top to bottom. It uses the `render.yaml` blueprint at the repo
root so most of the setup is filled in for you. Everything here is done by YOU,
signed into your own Render account — that's the part an assistant can't and
shouldn't do for you.

Expect ~30–45 minutes, mostly waiting for builds.

## Before you start
- [ ] Push this repo to GitHub or GitLab (Render deploys from a git repo).
- [ ] Have a Render account (render.com) with a payment method — managed Postgres
      with daily backups is a paid tier.

## 1. Create everything from the blueprint
- [ ] Render Dashboard → **New** → **Blueprint**.
- [ ] Connect the repo. Render finds `render.yaml` and lists what it will create:
      `sowoccul-db`, `sowoccul-api`, `sowoccul-web`.
- [ ] It will prompt for the values marked "you provide". Fill in:
      - `ADMIN_USERNAME` — e.g. `admin`
      - `ADMIN_PASSWORD` — a STRONG password (8+ chars; you'll change it after login)
      - `ADMIN_FULL_NAME` — e.g. `System Administrator`
      - `ADMIN_EMAIL` — your admin email
      - `ADMIN_BRANCH` — e.g. `Limbe`
      - `CLIENT_ORIGIN` — leave blank for now; you'll set it in step 3.
      - `VITE_API_BASE` — leave blank (the rewrite handles it).
- [ ] Click **Apply**. Render creates the database and starts building the two
      services. `DATABASE_URL` and `JWT_SECRET` are set automatically — you never
      touch them.

## 2. Confirm the API is alive
- [ ] Wait for `sowoccul-api` to finish deploying (watch its Logs).
- [ ] Open its URL and visit `/api/health`. You want: `{ "ok": true }` over https.
- [ ] If it won't boot, read the last log lines. Almost always it's a missing
      `DATABASE_URL` (shouldn't happen with the blueprint) — if you see a
      different error, copy the log line and ask; it's usually a one-line fix.

## 3. Wire the two services together
- [ ] Copy the real URL of `sowoccul-api` (top of its dashboard page).
- [ ] In `render.yaml`, check the web service's `/api/*` rewrite `destination`
      matches that URL exactly. If Render added a suffix to the name, update the
      line, commit, and let it redeploy. (If it already matches, nothing to do.)
- [ ] On `sowoccul-api` → **Environment**, set `CLIENT_ORIGIN` to the
      `sowoccul-web` URL (e.g. `https://sowoccul-web.onrender.com`). Save; it
      redeploys. This lets the browser talk to the API.

## 4. Seed the first admin
- [ ] Open `sowoccul-api` → **Shell**.
- [ ] Run: `npm run seed`
      (the ADMIN_* vars are already in the environment, so it just works).
- [ ] You should see it create one admin and exit. It will NOT create demo data.

## 5. Smoke-test the real thing
- [ ] Open the `sowoccul-web` URL. Sign in as the admin.
- [ ] **Change the admin password immediately.**
- [ ] Create a test member, give them two accounts, and move money between them.
- [ ] Apply for a loan as the member; approve it as staff/admin.
- [ ] Watch for anything wrong — a balance that looks off, a transfer that seems
      half-done. If you see that, stop and report exactly what happened.

## 6. Prove backups once
- [ ] `sowoccul-db` → **Backups**: confirm daily backups are on; note retention.
- [ ] (Optional but recommended) From a machine with `psql`/`pg_dump` and the
      database's EXTERNAL url, run `server/scripts/backup.sh` then
      `server/scripts/restore-drill.sh` until it prints **PASS**. See
      `docs/RUNBOOK-backups.md`.

## 7. Keep members out (closed launch)
- [ ] Do not publish the web URL to members yet.
- [ ] Consider disabling public registration until you're ready.
- [ ] Decide deliberately who has access during the closed period.

---

When all boxes are ticked, you have a real, running, private deployment. The
before-members list (2FA, maker-checker, KYC storage, insert-only audit,
compliance review) is still the gate before any real member savings touch this —
see the checklist in `README.md`.
