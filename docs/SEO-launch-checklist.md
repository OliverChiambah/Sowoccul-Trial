# SOWOCCUL — SEO Launch Checklist (off-site)

The website code is already prepared for search engines (title, description, structured
data, sitemap, robots.txt, share image, fast loading). Those help search engines
*understand* the site. This checklist is the other half — the steps **you** must do
in your own accounts so search engines *find, trust, and rank* the site. None of it
is code.

Do these in order. The first four matter most.

---

## 1. Deploy the site and connect the domain (prerequisite)

Nothing below works until the site is live at **https://sowoccul.cm**.

- [ ] Deploy the app on Render (see `docs/RUNBOOK-deploy-render.md`).
- [ ] In Render, add `sowoccul.cm` as a custom domain on the web (frontend) service.
- [ ] In your domain registrar (where you bought sowoccul.cm), add the DNS record
      Render gives you. Also set up `www.sowoccul.cm` to redirect to `sowoccul.cm`
      (or vice-versa) so you don't split your reputation across two addresses.
- [ ] Wait for Render to issue the HTTPS certificate, then open https://sowoccul.cm
      and confirm the padlock shows.

**Check:** visiting `https://sowoccul.cm/robots.txt` and `https://sowoccul.cm/sitemap.xml`
should show the files. If they 404, the deploy isn't serving the `public/` folder — fix
that before continuing.

---

## 2. Google Search Console (this is how Google officially "sees" you)

Free. This is the single most important off-site step.

- [ ] Go to https://search.google.com/search-console and sign in with a Google account
      you control (use a company account, not a personal one, if you can).
- [ ] Add a property for `sowoccul.cm`. Choose the **Domain** property type and verify
      by adding the DNS TXT record it gives you at your registrar.
- [ ] Once verified, go to **Sitemaps** and submit: `sitemap.xml`
- [ ] Use **URL Inspection** on `https://sowoccul.cm/` and click **Request indexing**.

This tells Google the site exists and asks it to crawl. Indexing can take a few days
to a couple of weeks — that's normal, don't panic.

---

## 3. Google Business Profile (this is what wins "credit union near me" and maps)

Free. For a local institution, this is as important as the website itself — it's what
puts you in Google Maps and the local "pack" of results.

- [ ] Go to https://www.google.com/business and create a profile for
      **Sonel Workers Credit Union (SOWOCCUL)**.
- [ ] Category: **Credit union** (add "Financial institution" as a secondary category).
- [ ] Add your **Limbe head office** address, phone, hours, and website (sowoccul.cm).
- [ ] Add each of the other branches (Douala, Bamenda, Yaoundé, Bafoussam, Garoua) as
      their own locations if they have their own address and phone.
- [ ] Verify the profile (Google mails a postcard with a code, or offers phone/video).
- [ ] Add real photos: the branch fronts, the logo, the team. Profiles with photos rank
      and convert far better.

**This is the biggest lever for "credit union in Cameroon" type searches.** Keep it
accurate and add a post or photo occasionally — Google rewards active profiles.

---

## 4. Make sure your name and details are identical everywhere (NAP consistency)

Search engines trust you more when your **N**ame, **A**ddress, and **P**hone match
exactly across the whole internet. Pick one exact format and use it everywhere.

- [ ] Decide the canonical form, e.g.
      **Sonel Workers Credit Union (SOWOCCUL)**, Limbe, +237 …
- [ ] Use that identical spelling, address, and phone on: the website, Google Business
      Profile, Facebook, any directory listing, letterheads, and your COBAC/MINFI
      registration references. Inconsistent details (e.g. "Sonel Credit Union" vs
      "SOWOCCUL Ltd") split your reputation and confuse ranking.

---

## 5. Get a few reputable links and mentions (this moves competitive rankings)

Ranking for "**best credit union in Cameroon**" is mostly about other trustworthy sites
mentioning and linking to you. You can't code this — you earn it. Realistic sources:

- [ ] Cameroonian business directories and microfinance/cooperative association listings.
- [ ] COBAC / MINFI / national cooperative registries that publish member institutions.
- [ ] Local news or community sites (a short press note about the online banking launch).
- [ ] Any partner organisations, employers whose staff you serve, or chambers of commerce.
- [ ] A Facebook Page and, optionally, LinkedIn — link them to sowoccul.cm and vice-versa.

A handful of genuine, relevant links beats dozens of spammy ones. **Never buy bulk
backlinks** — Google penalises that and it can get you removed from results entirely.

---

## 6. Social presence (supports the above, and owns your name)

- [ ] Create a **Facebook Page** named exactly "Sonel Workers Credit Union (SOWOCCUL)".
      In Cameroon, Facebook is often where people look first — claim the name before
      someone else does.
- [ ] Put `sowoccul.cm` in the page's website field.
- [ ] Post the launch. When you share the link, the share image we built will appear.

---

## 7. After a couple of weeks — check and tune

- [ ] In Search Console, check **Pages** → are your public pages indexed? Fix anything
      reported as excluded.
- [ ] Check **Performance** → which searches already show your site, and where you rank.
- [ ] Search Google yourself for `sowoccul`, `Sonel Workers Credit Union`, and
      `SOWOCCUL Cameroon`. You should start appearing for these name searches first —
      they're the easy wins.

---

## Honest expectations

- **Your own name** (sowoccul, Sonel Workers Credit Union): you should rank first within
  weeks of indexing — almost nobody competes for these words. This is the realistic win.
- **"credit union in Cameroon" / "best credit union in Cameroon":** competitive. Steps
  3–5 (Business Profile, consistent details, real links, reviews) decide this, and it
  builds over **months**, not days. There is no code change or trick that jumps you to
  #1 here — anyone who promises that is not being truthful.
- **Reviews matter:** politely ask satisfied members to leave a Google review. Genuine
  reviews are one of the strongest signals for a local financial institution.

Keep the site accurate and the Business Profile active, and your rankings will climb
steadily and honestly.
