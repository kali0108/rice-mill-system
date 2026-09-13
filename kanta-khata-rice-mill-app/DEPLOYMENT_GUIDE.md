# Deploying Kanta Khata — Supabase + Vercel

This is a straight-through guide: fresh install, updating a site that's already live, and
fixes for the exact problems people run into. Follow it top to bottom.

---

## Part A — Fresh install (first time ever deploying this)

### A1. Create the Supabase project
1. [supabase.com](https://supabase.com) → **New Project**. Any name/region, set a database password (you won't need it again for this app).
2. Wait for it to finish provisioning (1-2 minutes).

### A2. Run the database schema
1. In your project, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from the zip, copy the **whole file**, paste it in, click **Run**.
3. You should see "Success. No rows returned." If you see a red error instead, stop and check you copied the *entire* file (it's long — scroll to make sure you got the top and bottom).

### A3. Turn off email confirmation
**Authentication → Settings** (left sidebar) → find **"Confirm email"** → make sure it's **OFF**.
This lets the Owner sign in immediately after creating their account, no inbox step.

### A4. Deploy the Edge Function (no CLI needed)
The Owner creating staff accounts with a password needs one small server-side function.
Easiest way — straight from the Supabase website, no terminal:

1. In your Supabase project, click **Edge Functions** in the left sidebar.
2. Click **Deploy a new function** → **Via Editor** (or "Create function" — wording varies slightly by Supabase version).
3. Name it exactly: `admin-create-user` (must match exactly, lowercase, with the dash).
4. Delete whatever placeholder code is in the editor, and paste the **entire contents** of
   `supabase/functions/admin-create-user/index.ts` from the zip.
5. Click **Deploy**.
6. Once deployed, click on the function and confirm **"Enforce JWT Verification"** is switched
   **ON** (this is the default, and is what makes sure only a logged-in Owner can call it).

That's it — no secrets to type in anywhere; Supabase automatically gives every Edge Function
access to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` behind the scenes.

*(Prefer the command line? `npm install -g supabase`, `supabase login`, `supabase link --project-ref YOUR-REF`, `supabase functions deploy admin-create-user` does the same thing. Either way works — just don't skip this step, since "Create New Staff Account" and "Reset Password" on the Users page depend on it.)*

### A5. Get your API keys
**Project Settings → API** → copy the **Project URL** and the **anon / public key**.

### A6. Configure and test locally (optional but recommended)
```bash
cp .env.example .env.local
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the values from A5, then:
```bash
npm install
npm run dev
```
Open the printed URL, create the Owner account, and confirm the dashboard loads.

### A7. Deploy to Vercel
1. Push this project to a GitHub repo (`git init && git add -A && git commit -m "init"`, create a repo on GitHub, `git remote add origin ...`, `git push -u origin main`).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import that repo. Vercel auto-detects Vite — no build settings to change.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as A6).
4. **Deploy**. Your app is live at `your-project.vercel.app`.

---

## Part B — Updating a site that's already live

You do **not** need to redo Part A. Your existing Supabase project and existing data stay
exactly as they are. Three things need updating:

### B1. Back up first
Log into the **live** site as Owner → **Import/Export** → **Download Full Backup (JSON)**.
Costs nothing, takes 10 seconds, means nothing below can hurt you.

### B2. Run the SQL migrations (in this exact order)
Same Supabase project, same SQL Editor. Run each of these as its own "Run", in order —
skip any you're certain you already ran, but if in doubt, run it anyway; they're all
safe to run more than once:

1. `supabase/migration_02_user_management.sql` *(has two steps written at the top — do Step 1 alone first)*
2. `supabase/migration_03_granular_permissions.sql`
3. `supabase/migration_04_admin_managed_users.sql`
4. `supabase/migration_05_ledger_edit_sync.sql`
5. `supabase/migration_06_realtime.sql` *(new — turns on live updates, see Part C)*

### B3. Deploy the Edge Function
Same as **A4** above, if you haven't already — check **Edge Functions** in your Supabase
sidebar; if `admin-create-user` isn't listed there, that's exactly why staff-account creation
fails (see Part C's first troubleshooting item).

### B4. Push the updated code
**If Vercel is connected to GitHub:** replace your project folder's contents with the new
zip's contents (keep your own `.env.local` / Vercel env vars, don't touch those), then:
```bash
git add -A
git commit -m "Update Kanta Khata"
git push
```
Vercel redeploys automatically in a minute or two.

**If you deploy via Vercel CLI directly:** unzip the new project, `cd` into it, run `vercel --prod`.

---

## Part C — Troubleshooting the exact issues you hit

### "Failed to send a request to the Edge Function" / staff accounts won't create
This specific error means the browser couldn't reach the function at all — almost always
because it was never deployed, or the name doesn't match exactly. Fix:
1. Supabase Dashboard → **Edge Functions** → is `admin-create-user` listed?
   - **Not listed** → do step A4 above.
   - **Listed but still failing** → click into it → **Logs** tab, try creating a staff account
     again, and see what error shows up server-side — that's the real cause. Also double-check
     the function name is exactly `admin-create-user` (no typos, no capital letters).
2. Confirm you're logged in as the **Owner** account when trying this — the function checks
   that server-side and rejects anyone else, on purpose.

### "When I log in as one user, the previous user gets logged out"
This isn't a bug — it's how browser sessions work for every website, not just this one
(the same thing happens on Gmail, your bank's site, etc.). **One browser can only be "logged
in" as one account at a time**, because the login is stored in that browser's local storage.

This does **not** affect real multi-user usage: if your Munshi is on their own phone or
computer, and your Sales Staff is on a different one, they'll each stay logged into their own
account completely independently — nothing here stops multiple different people from using
the app at the same time on different devices.

What it does affect is **testing** — if you personally try to check "does it work as Owner"
and "does it work as Sales Staff" back-to-back **in the same browser**, the second login will
replace the first. To test multiple accounts side-by-side yourself, use:
- A normal window + an **Incognito/Private window** (each has separate storage), or
- Two different browsers (Chrome + Firefox), or
- Two different devices.

### Page keeps refreshing / flickering by itself
Fixed in this update. The previous version quietly re-fetched every table every 20 seconds
and showed a loading flash each time — annoying if you were mid-edit. It's been replaced with
two things:
- **Realtime**: changes from any user now push into everyone else's screen instantly, so
  there's no need to poll at all in the normal case.
- A much longer (60-second) *silent* background safety-check with no loading flash, only as
  a fallback in case a realtime update was somehow missed (e.g. a laptop woke from sleep).

Make sure you've deployed the **updated code** (Part B4) and run **migration_06_realtime.sql**
(Part B2, step 5) — both are needed together; the code change alone won't do anything without
Realtime turned on in the database, and vice versa.

### Realtime doesn't seem to be working after updating
- Confirm `migration_06_realtime.sql` actually ran without errors.
- Supabase Dashboard → **Database → Replication** → you should see all the module tables
  listed under the `supabase_realtime` publication. If a table's missing, re-run the migration.
- Hard-refresh the browser once after deploying the new code (old cached JS won't have the
  realtime subscriptions in it).

### General checklist if something else feels broken
1. Browser console (F12 → Console tab) — the actual error is almost always shown there in
   plain English even when the on-screen message is vague. Worth checking before anything else.
2. Supabase → **Edge Functions → Logs** and **Database → Logs** for anything server-side.
3. Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's Environment Variables
   exactly match your Supabase project's (Project Settings → API) — a stale or mistyped key
   here causes all sorts of confusing failures.
