# HTTPS everywhere (Render)

The good news: on Render you do **not** manage certificates. TLS is automatic and
free (Let's Encrypt), issued and renewed for you on every service and custom
domain. This runbook is about making sure HTTPS is actually *enforced* and that
nothing silently falls back to plain HTTP.

---

## 1. What Render gives you for free

- Every `*.onrender.com` URL is HTTPS out of the box.
- Add a custom domain and Render provisions and auto-renews a certificate for it,
  usually within minutes of the DNS records resolving.
- Certificates renew automatically; there is no certbot to run, no cron.

So the certificate side is handled. The remaining work is enforcement and config.

---

## 2. Force HTTPS (no HTTP fallback)

1. On each service (API Web Service and the Static Site) confirm HTTPS works, then
   make sure HTTP redirects to HTTPS. Render redirects `http→https` for custom
   domains by default; verify by visiting `http://your-domain` and confirming the
   browser lands on `https://`.
2. In the app, don't hard-code `http://` anywhere. The frontend calls the API by
   relative `/api` paths or an `https://` base URL — never `http://`.
3. Set `CLIENT_ORIGIN` (API env var) to the `https://` frontend URL so CORS only
   ever allows the secure origin.

---

## 3. Tell browsers to always use HTTPS (HSTS)

Add an HSTS response header so browsers refuse to talk to the site over HTTP even
once they've seen it. On Render you can set response headers on the Static Site
(**Settings → Headers**) and in the API via middleware.

Suggested header (start with a short max-age, raise it once you're confident):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Only enable `includeSubDomains` (and `preload`) once every subdomain is HTTPS —
otherwise you can lock yourself out of an HTTP-only subdomain.

If you prefer to set it in Express, add early in `server/src/index.js`:

```js
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
```

> This app does not currently set HSTS in code. Add the middleware above if you
> want defense in depth beyond Render's platform redirects.

---

## 4. Database connection is also TLS

Application ↔ database traffic is separate from web HTTPS. Render's managed
Postgres requires SSL, and this app enables it automatically for any non-localhost
`DATABASE_URL` (see `server/src/db/index.js`). So the ledger data is encrypted in
transit as well, not just the web pages. Nothing to configure.

---

## 5. Verify

- [ ] `https://your-domain` loads with a valid padlock.
- [ ] `http://your-domain` redirects to `https://`.
- [ ] `GET https://your-domain/api/health` → `{ ok: true }`.
- [ ] Response includes a `Strict-Transport-Security` header (if you enabled it).
- [ ] No mixed-content warnings in the browser console (no `http://` assets).
