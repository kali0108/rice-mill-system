-- ============================================================================
-- Kanta Khata — migration for projects already on schema v2 or v3.
-- Run AFTER migration_02 and migration_03 if you haven't already (check your
-- SQL Editor history, or just re-run them — every statement in them is safe
-- to run twice via "if exists"/"or replace").
--
-- If you're setting up a brand-new Supabase project, ignore this file and
-- just run supabase/schema.sql instead — it already includes everything below.
--
-- Select everything below and Run.
-- ============================================================================

-- Self-signup no longer assigns invited roles or falls back to sales_staff —
-- it's Owner-account-only now. Everyone else is created directly by the
-- Owner via the admin-create-user Edge Function (see README), which upgrades
-- their 'pending' row to a real role right after this trigger creates it.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(*) into cnt from profiles;
  insert into profiles (id, full_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    case when cnt = 0 then 'owner'::user_role else 'pending'::user_role end,
    'active'
  );
  return new;
end; $$;

-- The invite mechanism is no longer used by the app — accounts are created
-- directly now. Safe to drop; nothing else references these.
drop function if exists invite_user(text, text, user_role);
drop function if exists revoke_invite(text);
drop table if exists invited_emails;

-- Owner-only, destructive: wipes every module's business data. Staff
-- accounts are untouched. Only ever called from the Reset Data page, which
-- re-verifies the Owner's password and a typed confirmation before calling this.
create or replace function owner_reset_all_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can reset data'; end if;
  truncate table purchases, ledger_entries, production_batches, stock_lots, sales, payments,
                 labor_entries, transport_entries, machinery_log, expenses, tax_records,
                 zakat_assessments, activity_log restart identity;
  insert into activity_log (user_id, table_name, action, record_id, details)
  values (auth.uid(), 'system', 'RESET', null, jsonb_build_object('message', 'Full data reset performed by Owner'));
end; $$;

-- ============================================================================
-- Done with SQL. Now deploy the Edge Function so the Owner can actually
-- create staff accounts from the Users page:
--   supabase login
--   supabase link --project-ref YOUR-PROJECT-REF
--   supabase functions deploy admin-create-user
-- (Full walkthrough in the README.)
-- ============================================================================
