# Kanta Khata — Rice Mill Manager

A multi-user, offline-capable rice mill management system: paddy purchase, khata/ledger,
production & recovery %, godown/stock, sales & billing, payments & cheques, labor & wages,
transport/logistics, machinery & daily expenses, and tax/Zakat compliance — with role-based
logins (Owner, Munshi, Godown Incharge, Sales Staff) backed by Supabase (Postgres + Auth),
deployable on Vercel.

This app is **deploy-ready** but not yet deployed — you'll need your own free Supabase and
Vercel accounts (I can't create accounts or click deploy on your behalf). The whole process
below takes about 10 minutes.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**. Pick any name/region, and a
   database password (save it somewhere — you likely won't need it again for this app).
2. Once the project is ready, open **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this folder, copy the **entire file**, paste it into the
   SQL editor, and click **Run**. This creates every table, the four roles, all row-level
   security policies, and the triggers that auto-post ledger entries from purchases/sales/payments.
4. Go to **Authentication → Providers** and confirm **Email** is enabled (it is by default).
5. Go to **Authentication → Settings** and turn **off** "Confirm email" — for a small internal
   mill team this lets staff sign in immediately after creating an account, with no inbox
   step. (Leave it on if you'd rather staff confirm by email first.)
6. Go to **Project Settings → API**. Copy the **Project URL** and the **anon / public key** —
   you'll need both in the next step.

## 2. Configure the app

```bash
cp .env.example .env.local
```

Edit `.env.local` and paste in your Project URL and anon key:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ....
```

Try it locally first:

```bash
npm install
npm run dev
```

Open the printed local URL, sign up with your own email — **the first account to ever sign
up automatically becomes Owner**. Every account after that defaults to Sales Staff until the
Owner sets their real role on the **Users & Roles** page.

## 3. Deploy to Vercel

**Option A — GitHub (recommended):**
1. Push this folder to a new GitHub repo (`git init`, `git add .`, `git commit`, then create
   a repo on GitHub and push).
2. On [vercel.com](https://vercel.com), **Add New → Project**, import that repo. Vercel
   auto-detects Vite (build command `npm run build`, output directory `dist`) — no changes needed.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   with the same values as your `.env.local`.
4. Click **Deploy**. Your mill's app is now live at `your-project.vercel.app` — share that
   link with your staff.

**Option B — Vercel CLI:**
```bash
npm i -g vercel
vercel login
vercel --prod
```
When prompted, set the same two environment variables (or run `vercel env add` first).

`vercel.json` is already included so client-side routing (e.g. refreshing on `/ledger`)
works correctly on Vercel's static hosting.

## 4. Add your staff

Have each staff member open the app and **Sign Up** with their own email — this gives every
person their own login and keeps the activity log meaningful (every entry is tagged with
who made it). As Owner, go to **Users & Roles** and set each person's role:

| Role | Can read | Can write |
|---|---|---|
| **Owner** | everything | everything, incl. changing roles |
| **Munshi / Accountant** | everything | Purchase, Khata/Ledger, Payments, Labor, Transport, Machinery/Expenses, Tax/Zakat |
| **Godown Incharge** | everything | Production, Stock, Labor, Transport, Machinery/Expenses |
| **Sales Staff** | everything | Sales & Billing only |

This is enforced in two places, redundantly: the UI hides forms/buttons a role can't use,
and — the part that actually matters for security — **Postgres row-level security** rejects
the write outright even if someone bypasses the UI. The full policy list is in `supabase/schema.sql`.

## Offline mode

Entries made with no internet are saved to the browser's IndexedDB and queued; the moment
the device is back online, the queue is replayed against Supabase automatically (and retried
every ~20s in the background as a safety net). Reads fall back to the last-synced copy of
each table when offline. This uses a practical outbox pattern rather than the Service Worker
Background Sync API, which many phone browsers (notably iOS Safari) don't support reliably —
so it works consistently on whatever phone or tablet is on the mill floor.

One limitation worth knowing: if two people edit the *same* record while both offline, the
last one to sync wins (no merge/conflict resolution). For a single mill's day-to-day entry
work this is rarely an issue since entries are mostly additive (new purchases, new batches),
not concurrent edits of one row.

## What's included vs. simplified

**Fully implemented:** all 12 operational modules from the original spec, role-based
multi-user login, Postgres RLS enforcement, auto-posting ledger entries, offline queue +
sync, CSV export on every register, printable sale invoices, an owner-only user/role manager,
and a full audit trail (`activity_log` table — who created/edited/deleted what, and when).

**Simplified, on purpose:**
- **Zakat** is a plain calculator (cash + bank + stock + receivables − payables, 2.5% above
  your entered nisab) — not a fatwa. Confirm nisab and any fiqh-specific rules with your own
  mufti/accountant.
- **Reports → Net P&L** nets Sales against Purchases, Labor, Daily Expenses, Machinery cost,
  and Freight/Commission for the selected date range. It does not account for depreciation,
  rent, or other large capital costs.
- No multi-mill/multi-tenant support — this Supabase project is scoped to one mill. (Adding
  a `mill_id` column + policy to every table would extend it to multiple mills if you ever
  need that.)
- No native mobile app — it's a responsive web app that works well on phones/tablets via the
  browser, and can be "Added to Home Screen" for an app-like icon.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build locally
```
