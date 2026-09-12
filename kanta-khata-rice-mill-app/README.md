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
   SQL editor, and click **Run**. This creates every table, the account states (Owner,
   Munshi, Godown Incharge, Sales Staff, and a permission-less "Pending" state), granular
   per-user permission overrides, the Reset Data function, all row-level security policies,
   and the triggers that auto-post ledger entries from purchases/sales/payments.

   *(Already ran an earlier version of schema.sql on this project? Don't re-run the file
   above — run whichever of these you're missing, in order: `migration_02_user_management.sql`
   → `migration_03_granular_permissions.sql` → `migration_04_admin_managed_users.sql` →
   `migration_05_ledger_edit_sync.sql`. If you're not sure which you've already run, they're
   all safe to run again — everything in them uses "if exists"/"or replace".)*
4. Go to **Authentication → Providers** and confirm **Email** is enabled (it is by default).
5. Go to **Authentication → Settings** and make sure "Confirm email" is **OFF** — the Owner
   signs in immediately after creating their account, no inbox step.
6. Go to **Project Settings → API**. Copy the **Project URL** and the **anon / public key** —
   you'll need both in the next step.

## 2. Deploy the admin-create-user function

The Owner creates every other staff account directly (email + password they choose), which
needs Supabase's service-role key — something that must never sit in the browser. So that one
operation runs as a small **Edge Function** on Supabase's own servers instead of in the app.
This is the one piece that isn't "just paste and click" — it needs the Supabase CLI, once:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF   # find this in your project's Settings -> General
supabase functions deploy admin-create-user
```

That's it — no secrets to copy or paste; `SUPABASE_SERVICE_ROLE_KEY` is injected automatically
for every Edge Function by Supabase. Until this is deployed, the "Create New Staff Account"
and "Reset Password" actions on the Users page will fail; everything else in the app works
without it.

## 3. Configure the app

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

Open the printed local URL — since no Owner exists yet, you'll see **Create Owner Account**
(the only self-service signup this app has). Fill it in and you're signed in right away as Owner.

## 4. Deploy to Vercel

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

## 5. Add your staff

Sign Up on the login screen is **Owner-only** — once an Owner account exists, that form
disappears entirely for everyone else. Every other account is created by the Owner, from
**Users & Roles → Create New Staff Account**: enter their name, email, a password (or click
**Generate** for a random one), and their role. The account is ready to use immediately — no
signup, no confirmation, nothing for the new person to do except be told their email and
password. That's the one-time screen where the credentials are shown — copy them before
navigating away, since they aren't stored anywhere retrievable afterward.

If someone somehow reaches Supabase's signup API directly instead of going through the app
(not something the UI offers, but worth knowing the safety net exists), their account is
created but sits in **Pending** with zero read/write access anywhere, visible to the Owner
under Staff Accounts so it can be dealt with.

You can **Edit** any existing account's name, role, or Active/Suspended status at any time —
suspending someone instantly revokes every permission, enforced in Postgres. You can also
**Reset Password** for anyone (except the Owner's own account, which is reset the normal way
via Sign In → forgot-password patterns you'd add later, or by resetting it directly in the
Supabase dashboard under Authentication → Users).

| Role | Can read | Can write (default) |
|---|---|---|
| **Owner** | everything | everything, incl. managing staff — cannot be restricted |
| **Munshi / Accountant** | everything | Purchase, Khata/Ledger, Payments, Labor, Transport, Machinery/Expenses, Tax, Zakat |
| **Godown Incharge** | everything | Production, Stock, Labor, Transport, Machinery/Expenses |
| **Sales Staff** | everything | Sales & Billing only |
| **Pending** | nothing | nothing — waiting screen only |

That table is just the *starting point* per role — the Owner can go further. Next to each
staff member (except the Owner) is a **Permissions** button opening a grid of every module
with three choices: **Default** (follow the role table above), **Allow** (write access even
if their role normally wouldn't have it), or **Deny** (block it even if their role normally
would). For example, a Sales Staff member could be individually granted write access to
Stock, or a Munshi could be denied Payments specifically — entirely the Owner's call, per
person, per module.

This is enforced in two places, redundantly: the UI hides forms/buttons a user isn't allowed
to use, and — the part that actually matters for security — **Postgres row-level security**
calls the same `has_permission()` function on every write, so an override takes effect
immediately and can't be bypassed by going around the UI. The full policy list is in
`supabase/schema.sql`.

Read access stays universal across all approved roles by design (everyone needs to see the
full picture to coordinate mill operations day to day) — only *write* is governed by the
role/override system above.

## Editing existing entries

Every module — Purchase, Khata/Ledger, Production, Stock, Sales, Payments, Labor, Transport,
Machinery Log, Daily Expenses, Tax Records, and Zakat — has a full **Edit** button next to
Delete on every row, not just Add-new-and-delete-the-mistake. Clicking it loads that record's
values back into the form at the top of the page; saving calls an update instead of creating
a new row, and Cancel discards the change. This follows the same permission rule as
everything else: whoever can write to a module can edit its existing entries, and since the
Owner always has write access everywhere, **the Owner can always edit anything, in any
module** — that's guaranteed by `has_permission()` in Postgres, not just a UI choice.

One integrity detail worth knowing: editing a **Purchase**, **Sale**, or **Payment** also
updates its auto-generated Khata entry to match (correct weight, rate, amount — whatever
changed) via a database-level upsert, so the ledger can't drift out of sync with the record
it came from the way a plain delete-and-recreate would risk. Editing a Khata entry directly
still works too, but if its original Purchase/Sale/Payment gets edited again afterward, that
auto-sync will overwrite the direct edit — for auto-generated entries, editing the source
record is the more durable fix.

## Reset Data

Owner-only, under **Reset Data**, for wiping every module's business data back to empty —
meant for things like starting a fresh season or clearing out test entries made while setting
this up. Staff accounts and logins are never touched by it.

Three separate confirmations are required, on purpose, since this can't be undone:
1. Re-enter the Owner account's password.
2. Type the word `RESET` into a confirmation box.
3. A final browser confirm dialog spelling out exactly what's about to happen.

Only after all three does it call `owner_reset_all_data()` — a Postgres function that also
checks the caller is an active Owner server-side, so this can't be triggered by anything
other than that exact flow. Take a **Full Backup** (Import/Export page) first if there's any
chance you'll want the data again.

## Calculator

A **Calculator** page (in the main nav, available to every approved role) has a standard
4-function calculator plus mill-specific quick calculators that reuse the exact same formulas
as the real modules: Maund⇄KG conversion, Paddy Purchase amount, Recovery %, Sale amount,
Freight & Arhti commission, Tax, and a Zakat quick estimate. Nothing here is saved — it's
scratch-pad math for the mill floor or office, separate from the module pages where entries
actually get recorded.

## Import / Export

Owner-only, under **Import / Export**. Two things:
- **Full Backup** — one click downloads every module's data as a single JSON file, for safekeeping.
- **Per-module CSV** — Export any module to CSV (opens fine in Excel), edit or add rows there,
  then Import that same file back in. Importing always **creates new rows** — it never
  overwrites or matches against existing entries, so re-importing a file you haven't trimmed
  down will duplicate rows. The safe pattern is: Export first to see the exact column format,
  add only the *new* rows you want in a copy of that file, then Import just those.

## Activity Log

Every insert, edit, and delete across all operational modules is recorded automatically (who,
what, when) and visible to the Owner under **Activity Log**, filterable by module and action
type. This is populated by a Postgres trigger, not app code, so it can't be bypassed by using
the API directly.

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

**Fully implemented:** all 12 operational modules from the original spec — each with full
Add/**Edit**/Delete, not just add-and-delete — role-based multi-user login with Owner-created
staff accounts and per-user Allow/Deny permission overrides on top of role defaults, Postgres
RLS enforcement, auto-posting (and auto-syncing on edit) ledger entries, offline queue + sync,
CSV export on every register, printable sale invoices, an owner-only user/permission manager
with password reset, a full audit trail with its own **Activity Log** page, a **Calculator**
page, an owner-only **Import/Export** page (CSV per module + full JSON backup), and a
triple-confirmed **Reset Data** page for wiping business data back to a clean slate.

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
