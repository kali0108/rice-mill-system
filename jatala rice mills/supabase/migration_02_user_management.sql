-- ============================================================================
-- Kanta Khata — migration for projects that already ran the ORIGINAL schema.sql.
-- (If you're setting up a brand-new Supabase project, ignore this file and
-- just run supabase/schema.sql instead — it already includes everything below.)
--
-- IMPORTANT: run STEP 1 by itself first (select it, click Run on its own).
-- Postgres doesn't allow a new enum value to be used in the same transaction
-- it was added in, and Supabase's SQL editor runs a whole paste as one
-- transaction — so Step 1 has to be its own separate "Run".
-- ============================================================================

-- ---------- STEP 1 — run this alone first -----------------------------------
alter type user_role add value if not exists 'pending';


-- ---------- STEP 2 — then select everything below and Run again ------------

alter table profiles add column if not exists status text not null default 'active' check (status in ('active','suspended'));
alter table profiles alter column role set default 'pending';

create table if not exists invited_emails (
  email text primary key,
  full_name text default '',
  role user_role not null default 'sales_staff',
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  used boolean not null default false
);
alter table invited_emails enable row level security;
drop policy if exists "invited_owner_all" on invited_emails;
create policy "invited_owner_all" on invited_emails for all using (my_role() = 'owner') with check (my_role() = 'owner');

-- Suspended accounts now get NULL back from my_role(), which matches no policy.
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active';
$$;

create or replace function owner_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where role = 'owner');
$$;
grant execute on function owner_exists() to anon, authenticated;

-- Unauthenticated signups without an invite now land in 'pending', not 'sales_staff'.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cnt int;
  inv invited_emails%rowtype;
begin
  select count(*) into cnt from profiles;
  if cnt = 0 then
    insert into profiles (id, full_name, role, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'owner', 'active');
    return new;
  end if;

  select * into inv from invited_emails where lower(email) = lower(new.email) and used = false limit 1;
  if found then
    insert into profiles (id, full_name, role, status)
    values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), inv.full_name), inv.role, 'active');
    update invited_emails set used = true where email = inv.email;
  else
    insert into profiles (id, full_name, role, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'pending', 'active');
  end if;
  return new;
end; $$;

create or replace function invite_user(target_email text, target_full_name text, target_role user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can invite staff'; end if;
  if target_role = 'pending' then raise exception 'Cannot invite someone as pending'; end if;
  insert into invited_emails (email, full_name, role, invited_by)
  values (lower(target_email), target_full_name, target_role, auth.uid())
  on conflict (email) do update set full_name = excluded.full_name, role = excluded.role, used = false, invited_at = now();
end; $$;

create or replace function revoke_invite(target_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can revoke invites'; end if;
  delete from invited_emails where email = lower(target_email) and used = false;
end; $$;

create or replace function admin_update_profile(target_user uuid, new_full_name text, new_role user_role, new_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can edit staff accounts'; end if;
  if new_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  if new_role = 'pending' and target_user in (select id from profiles where role='owner') then
    raise exception 'Cannot demote the Owner to pending';
  end if;
  update profiles set full_name = coalesce(new_full_name, full_name), role = new_role, status = new_status
  where id = target_user;
end; $$;

-- Tighten every table's read policy: pending/suspended accounts no longer see
-- operational data (previously any signed-in user could read everything).
do $$
declare t text;
begin
  foreach t in array array['purchases','ledger_entries','production_batches','stock_lots','sales',
                            'payments','labor_entries','transport_entries','machinery_log','expenses',
                            'tax_records','zakat_assessments']
  loop
    execute format('drop policy if exists "%1$s_read" on %1$s;', t);
    execute format('create policy "%1$s_read" on %1$s for select using (my_role() in (''owner'',''munshi'',''godown_incharge'',''sales_staff''));', t);
  end loop;
end $$;

create index if not exists activity_log_created_at_idx on activity_log (created_at desc);
create index if not exists activity_log_table_name_idx on activity_log (table_name);

-- ============================================================================
-- Done. Now go to Authentication -> Settings and turn ON "Confirm email".
-- Existing staff accounts are unaffected — they all default to status='active'
-- and keep whatever role they already had.
-- ============================================================================
