-- ============================================================================
-- Jatala Rice Mills — migration_07: v4 -> v5 upgrade (EXISTING projects)
--
-- Kab chalayein: aap ka project pehle se live hai aur aap ne v4 schema.sql
-- (ya migration_02 ... migration_06) chalaya hua hai. Aap ka saara data
-- mehfooz rehta hai — yeh sirf naye columns/tables/functions add karta hai,
-- security holes band karta hai aur purane data ko naye hisaab se set karta hai.
--
-- Pehle: app mein Owner login -> Import/Export -> "Full Backup" download karein.
-- Phir:  Supabase -> SQL Editor -> New query -> yeh poori file paste -> Run.
-- Dobara chalana bhi safe hai (idempotent).
--
-- Naya (khali) project? Is ki jagah supabase/schema.sql chalayein.
-- ============================================================================

-- Purane migrations chalaye bina yeh file na chalayein:
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'permissions') then
    raise exception 'Pehle migration_02 se migration_06 tak chalayein (ya naye project par schema.sql).';
  end if;
end $$;

begin;

-- ============================================================================
-- PART 1 — TABLE CHANGES (upgrade from v4). Every statement is idempotent.
-- ============================================================================

-- v5.4: Manager role (role comparisons in functions use ::text, so the new
-- value is safe to add inside this same transaction)
alter type user_role add value if not exists 'manager' after 'owner';

-- New columns (appended, same order as a fresh v5 install)
alter table purchases add column if not exists slip_no text not null default '';
alter table purchases add column if not exists vehicle_no text not null default '';
alter table purchases add column if not exists bag_wt_kg numeric not null default 0;
alter table purchases add column if not exists deduction_kg numeric not null default 0;
alter table purchases add column if not exists commission_pct numeric not null default 0;
alter table purchases add column if not exists commission_amount numeric not null default 0;
alter table purchases add column if not exists labor_charges numeric not null default 0;
alter table purchases add column if not exists total_payable numeric not null default 0;
alter table purchases add column if not exists notes text not null default '';
alter table purchases add column if not exists khata_of text not null default '';

alter table production_batches add column if not exists variety text not null default '';
alter table production_batches add column if not exists notes text not null default '';
alter table production_batches add column if not exists outputs jsonb not null default '[]'::jsonb;

alter table stock_lots add column if not exists variety text not null default '';
alter table stock_lots add column if not exists status text not null default 'In Stock';
alter table stock_lots add column if not exists notes text not null default '';

alter table sales add column if not exists invoice_no text not null default '';
alter table sales add column if not exists variety text not null default '';
alter table sales add column if not exists bags int not null default 0;
alter table sales add column if not exists rate_unit text not null default 'kg';
alter table sales add column if not exists vehicle_no text not null default '';
alter table sales add column if not exists received_now numeric not null default 0;
alter table sales add column if not exists notes text not null default '';

alter table payments add column if not exists bank_name text not null default '';
alter table payments add column if not exists notes text not null default '';

alter table labor_entries add column if not exists paid_date date;
alter table labor_entries add column if not exists paid_via text not null default 'Cash';
alter table labor_entries add column if not exists notes text not null default '';

alter table transport_entries add column if not exists party_name text not null default '';
alter table transport_entries add column if not exists paid_via text not null default 'Cash';
alter table transport_entries add column if not exists total_amount numeric not null default 0;

alter table machinery_log add column if not exists paid_via text not null default 'Cash';
alter table machinery_log add column if not exists party_name text not null default '';

alter table expenses add column if not exists party_name text not null default '';

-- Unique (source, source_id) on the ledger (v4 migration_05 adds it; make sure)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ledger_source_unique') then
    alter table ledger_entries add constraint ledger_source_unique unique (source, source_id);
  end if;
end $$;

-- created_by / user_id foreign keys: ON DELETE SET NULL, so a staff login can
-- be deleted from Supabase Auth without "violates foreign key constraint".
do $$
declare
  t text; col text; con record;
begin
  for t, col in
    select * from (values
      ('purchases','created_by'),('ledger_entries','created_by'),('production_batches','created_by'),
      ('stock_lots','created_by'),('sales','created_by'),('payments','created_by'),
      ('labor_entries','created_by'),('transport_entries','created_by'),('machinery_log','created_by'),
      ('expenses','created_by'),('tax_records','created_by'),('zakat_assessments','created_by'),
      ('activity_log','user_id')) v(t, col)
  loop
    for con in
      select c.conname from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = ('public.' || t)::regclass and c.contype = 'f' and a.attname = col
        and c.confdeltype <> 'n'
    loop
      execute format('alter table %I drop constraint %I', t, con.conname);
    end loop;
    if not exists (
      select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = ('public.' || t)::regclass and c.contype = 'f' and a.attname = col
    ) then
      execute format('alter table %I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
                     t, t || '_' || col || '_fkey', col);
    end if;
  end loop;
end $$;

-- ---------- v5 new tables ----------------------------------------------------

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  mill_name text not null default 'Rice Mill',
  address text not null default '',
  phone text not null default '',
  ntn text not null default '',
  strn text not null default '',
  season_start date,
  fumigation_days int not null default 30,
  ageing_days int not null default 60,
  invoice_prefix text not null default 'INV-',
  slip_prefix text not null default 'PS-',
  invoice_footer text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  party_type text not null,
  name text not null,
  phone text not null default '',
  address text not null default '',
  cnic text not null default '',
  opening_balance numeric not null default 0,
  opening_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  notes text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  item text not null,
  variety text not null default '',
  direction text not null default 'In',
  qty_kg numeric not null default 0,
  reason text not null default 'Other',
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists cash_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  account text not null default 'Cash',
  direction text not null default 'In',
  category text not null default 'Other Income',
  amount numeric not null default 0,
  description text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other',
  has_variety boolean not null default true,
  sale_unit text not null default 'maund',
  active boolean not null default true,
  sort_order int not null default 100,
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists varieties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 100,
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- ============================================================================
-- PART 1b — v5.2 (enterprise): sauda / contracts, weighbridge (kanta),
-- export invoice fields, period lock, audit old values. Idempotent — the same
-- statements run on a fresh install and on an upgrade.
-- ============================================================================

alter table settings add column if not exists lock_date date;
alter table activity_log add column if not exists old_details jsonb;

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  contract_no text not null default '',
  date date not null,
  kind text not null default 'sale',
  party_type text not null default 'Customer',
  party_name text not null,
  item text not null default '',
  variety text not null default '',
  qty_kg numeric not null default 0,
  rate numeric not null default 0,
  rate_unit text not null default 'maund',
  currency text not null default 'PKR',
  fx_rate numeric not null default 1,
  delivery_from date,
  delivery_to date,
  payment_terms text not null default '',
  status text not null default 'Open',
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists weighments (
  id uuid primary key default gen_random_uuid(),
  slip_no text not null default '',
  date date not null,
  kind text not null default 'Purchase',
  vehicle_no text not null default '',
  party_name text not null default '',
  item text not null default '',
  first_wt numeric not null default 0,
  first_at timestamptz,
  second_wt numeric,
  second_at timestamptz,
  net_wt numeric not null default 0,
  fee numeric not null default 0,
  status text not null default 'Open',
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table sales add column if not exists currency text not null default 'PKR';
alter table sales add column if not exists fx_rate numeric not null default 1;
alter table sales add column if not exists amount_fc numeric not null default 0;
alter table sales add column if not exists buyer_ref text not null default '';
alter table sales add column if not exists destination text not null default '';
alter table sales add column if not exists port_loading text not null default '';
alter table sales add column if not exists port_discharge text not null default '';
alter table sales add column if not exists vessel text not null default '';
alter table sales add column if not exists bl_no text not null default '';
alter table sales add column if not exists lc_no text not null default '';
alter table sales add column if not exists payment_terms text not null default '';
alter table sales add column if not exists packing text not null default '';
alter table sales add column if not exists gross_weight_kg numeric not null default 0;
alter table sales add column if not exists contract_id uuid references contracts(id) on delete set null;
alter table purchases add column if not exists contract_id uuid references contracts(id) on delete set null;
alter table purchases add column if not exists weighment_id uuid references weighments(id) on delete set null;

-- ============================================================================
-- PART 1c — v5.3: paddy drying (sukhai), bardana (bags) account, moisture
-- deduction rule. Idempotent — same statements for fresh install and upgrade.
-- ============================================================================

alter table settings add column if not exists moisture_base_pct numeric not null default 0;
alter table settings add column if not exists moisture_kg_per_point numeric not null default 0;

create table if not exists drying_batches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  variety text not null default '',
  lot_ref text not null default '',
  method text not null default 'Dhoop (sun)',
  weight_before_kg numeric not null default 0,
  weight_after_kg numeric not null default 0,
  loss_kg numeric not null default 0,
  moisture_before numeric not null default 0,
  moisture_after numeric not null default 0,
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists bag_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  movement text not null default 'Issued',
  party_type text not null default 'Arhti',
  party_name text not null default '',
  bag_type text not null default 'Jute',
  qty int not null default 0,
  rate numeric not null default 0,
  charge_to_party boolean not null default false,
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);


-- v5.4: brand
alter table settings alter column mill_name set default 'Jatala Rice Mills';
-- ============================================================================
-- PART 2 — LOGIC: helpers, security, auto-calculations, auto-khata posting,
-- reports, RLS, grants, realtime. Everything here is idempotent (create or
-- replace / drop if exists), so it is safe to run more than once.
-- ============================================================================

insert into settings (id) values (1) on conflict (id) do nothing;

-- A cheque saved without an explicit status starts as 'Pending' (the trigger
-- below decides; an empty default lets it tell "not given" from "Cleared").
alter table payments alter column status set default '';

-- Gap-free document numbers (slip / invoice). A counter row is incremented
-- inside the same transaction as the insert, so a rejected entry never burns
-- a number (a plain sequence would leave gaps).
create table if not exists doc_counters (name text primary key, value bigint not null default 0);
alter table doc_counters enable row level security;  -- no policies: not reachable through the API
revoke all on doc_counters from anon, authenticated;

create or replace function next_doc_no(p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into doc_counters as c (name, value) values (p_name, 1)
  on conflict (name) do update set value = c.value + 1
  returning c.value into v;
  return v;
end; $$;

create or replace function set_doc_no(p_name text, p_value bigint) returns void
language sql security definer set search_path = public as $$
  insert into doc_counters (name, value) values (p_name, greatest(coalesce(p_value, 0), 0))
  on conflict (name) do update set value = excluded.value;
$$;

create unique index if not exists parties_type_name_uq on parties (party_type, lower(name));
create unique index if not exists products_name_uq on products (lower(name));
create unique index if not exists varieties_name_uq on varieties (lower(name));

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

-- Today's date in Pakistan (the database itself runs in UTC).
create or replace function pk_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Karachi')::date;
$$;

-- 4900 -> '4,900'   4900.5 -> '4,900.50'
create or replace function kk_num(n numeric) returns text
language sql immutable set search_path = public as $$
  select case
    when n is null then '0'
    when n = trunc(n) then to_char(n, 'FM999,999,999,999,990')
    else to_char(round(n, 2), 'FM999,999,999,999,990.00')
  end;
$$;

-- Normalised party-name key: trimmed, single-spaced, lower-case.
create or replace function kk_norm(x text) returns text
language sql immutable set search_path = public as $$
  select lower(regexp_replace(trim(coalesce(x, '')), '\s+', ' ', 'g'));
$$;

-- True only inside trusted database code (ledger_upsert / ledger_remove /
-- restore). The API cannot set this flag, so a browser can never forge or
-- alter an auto-generated khata entry.
create or replace function kk_internal() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('kk.ledger_internal', true), '') = 'on';
$$;

-- Validation is relaxed only while restoring an old backup.
create or replace function kk_strict() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('kk.restoring', true), '') <> 'on';
$$;

-- ---------------------------------------------------------------------------
-- Roles & permissions
-- ---------------------------------------------------------------------------

-- Caller's role, or NULL when not signed in / suspended / no profile.
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active';
$$;

-- Never NULL (the v4 functions used "my_role() <> 'owner'", which is NULL —
-- i.e. NOT an error — for anonymous and suspended callers).
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from profiles where id = auth.uid() and status = 'active'), false);
$$;

create or replace function is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('owner','manager','munshi','godown_incharge','sales_staff')
                   from profiles where id = auth.uid() and status = 'active'), false);
$$;

-- Owner or Manager: may manage staff accounts and their permissions
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('owner','manager')
                   from profiles where id = auth.uid() and status = 'active'), false);
$$;

-- What a role can write in a module before any per-user override.
create or replace function role_default_permission(r user_role, module text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when r is null or r::text = 'pending' then false
    when r::text in ('owner', 'manager') then true
    when module in ('purchase','ledger','payments','cashbook','tax','zakat','products') then r::text = 'munshi'
    when module in ('production','stock','labor','transport','machinery','expenses','weighbridge') then r::text in ('munshi','godown_incharge')
    when module in ('sales','parties') then r::text in ('munshi','sales_staff')
    else false
  end;
$$;

-- Role defaults per action. Every approved role may VIEW every module unless
-- the Owner/Manager switches it off for that user.
create or replace function role_default_can(r user_role, module text, action text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when r is null or r::text = 'pending' then false
    when r::text in ('owner', 'manager') then true
    when action = 'view' then true
    else role_default_permission(r, module)
  end;
$$;

-- Can the signed-in user do ACTION (view | add | edit | delete) in MODULE?
-- profiles.permissions = { module: { view, add, edit, delete } } (only the
-- overridden actions are stored); old style { module: true/false } = all
-- write actions on/off.
create or replace function can_do(module text, action text default 'add') returns boolean
language plpgsql stable security definer set search_path = public as $$
declare prof record; v jsonb;
begin
  select role, status, permissions into prof from profiles where id = auth.uid();
  if not found or prof.status <> 'active' or prof.role::text = 'pending' then return false; end if;
  if prof.role::text = 'owner' then return true; end if;
  v := prof.permissions -> module;
  if v is not null and jsonb_typeof(v) = 'boolean' then
    if action = 'view' then return role_default_can(prof.role, module, 'view') or v = 'true'::jsonb; end if;
    return v = 'true'::jsonb;
  end if;
  if v is not null and jsonb_typeof(v) = 'object' and jsonb_typeof(v -> action) = 'boolean' then
    return (v ->> action)::boolean;
  end if;
  return role_default_can(prof.role, module, action);
end; $$;

-- Kept for older code: "may change data in this module"
create or replace function has_permission(module text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_do(module, 'edit');
$$;

create or replace function owner_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where role = 'owner');
$$;

-- New auth user -> profile. The very first account ever becomes Owner; every
-- other account starts as 'pending' (zero access) until the Owner sets a role.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  perform pg_advisory_xact_lock(hashtext('kanta_khata_first_owner'));
  select count(*) into cnt from profiles;
  insert into profiles (id, full_name, role, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when cnt = 0 then 'owner'::user_role else 'pending'::user_role end, 'active')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Staff can only ever change their own display name. Role / status /
-- permissions are changed exclusively through the Owner-only functions below
-- (which run as the database owner, so this guard lets them through).
create or replace function profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id or new.role is distinct from old.role
       or new.status is distinct from old.status or new.permissions is distinct from old.permissions then
      raise exception 'Role, status aur permissions sirf Owner "Users & Roles" page se badal sakta hai';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard before update on profiles
for each row execute function profiles_guard();

create or replace function admin_update_profile(target_user uuid, new_full_name text, new_role user_role, new_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare cur record; other_owners int; i_am_owner boolean := is_owner();
begin
  if not is_admin() then raise exception 'Sirf Owner ya Manager staff accounts edit kar sakta hai'; end if;
  if new_role is null then raise exception 'Role zaroori hai'; end if;
  if new_status is null or new_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  select * into cur from profiles where id = target_user for update;
  if not found then raise exception 'Account nahi mila'; end if;
  if target_user = auth.uid() and (new_role::text <> cur.role::text or new_status <> 'active') then
    raise exception 'Aap apna khud ka role ya status tabdeel nahi kar sakte (warna app lock ho jayegi)';
  end if;
  if not i_am_owner then
    if cur.role::text in ('owner', 'manager') and target_user <> auth.uid() then
      raise exception 'Manager kisi Owner ya doosre Manager ka account nahi badal sakta';
    end if;
    if new_role::text in ('owner', 'manager') and target_user <> auth.uid() then
      raise exception 'Sirf Owner kisi ko Owner ya Manager bana sakta hai';
    end if;
  end if;
  if cur.role::text = 'owner' and (new_role::text <> 'owner' or new_status <> 'active') then
    select count(*) into other_owners from profiles
    where role::text = 'owner' and status = 'active' and id <> target_user;
    if other_owners = 0 then raise exception 'Kam az kam ek active Owner hona zaroori hai'; end if;
  end if;
  update profiles
     set full_name = coalesce(trim(new_full_name), full_name), role = new_role, status = new_status
   where id = target_user;
end; $$;

create or replace function admin_set_permissions(target_user uuid, perms jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare clean jsonb; t_role text;
begin
  if not is_admin() then raise exception 'Sirf Owner ya Manager permissions set kar sakta hai'; end if;
  select role::text into t_role from profiles where id = target_user;
  if t_role is null then raise exception 'Account nahi mila'; end if;
  if t_role = 'owner' then raise exception 'Owner ki permissions restrict nahi ki ja sakti'; end if;
  if target_user = auth.uid() then raise exception 'Apni permissions khud nahi badal sakte'; end if;
  if t_role = 'manager' and not is_owner() then raise exception 'Manager ki permissions sirf Owner badal sakta hai'; end if;
  -- keep known modules only; booleans (old style) or {view, add, edit, delete};
  -- any write right also gives view (otherwise saving would fail)
  select coalesce(jsonb_object_agg(m.key, m.val), '{}'::jsonb) into clean
  from (
    select e.key,
           case
             when jsonb_typeof(e.value) = 'boolean' then e.value
             when jsonb_typeof(e.value) = 'object' then (
               select case when coalesce((o ->> 'add')::boolean, false) or coalesce((o ->> 'edit')::boolean, false)
                                or coalesce((o ->> 'delete')::boolean, false)
                           then o || '{"view": true}'::jsonb else o end
               from (select jsonb_object_agg(a.key, a.value) as o from jsonb_each(e.value) a
                     where a.key in ('view', 'add', 'edit', 'delete') and jsonb_typeof(a.value) = 'boolean') x
               where x.o is not null)
           end as val
    from jsonb_each(coalesce(perms, '{}'::jsonb)) e
    where e.key in ('purchase','parties','ledger','payments','cashbook','sales','production','stock','labor','transport',
                    'machinery','expenses','tax','zakat','products','weighbridge','reports')
  ) m
  where m.val is not null;
  update profiles set permissions = clean where id = target_user;
end; $$;

-- ---------------------------------------------------------------------------
-- Khata (ledger) posting helpers
-- ---------------------------------------------------------------------------

create or replace function ledger_upsert(p_source text, p_source_id uuid, p_date date, p_party_type text,
                                         p_party_name text, p_description text, p_debit numeric, p_credit numeric)
returns void
language plpgsql set search_path = public as $$
declare v_prev text := coalesce(current_setting('kk.ledger_internal', true), '');
begin
  perform set_config('kk.ledger_internal', 'on', true);
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (p_date, p_party_type, p_party_name, coalesce(p_description, ''),
          round(coalesce(p_debit, 0), 2), round(coalesce(p_credit, 0), 2), p_source, p_source_id)
  on conflict (source, source_id) do update set
    date = excluded.date, party_type = excluded.party_type, party_name = excluded.party_name,
    description = excluded.description, debit = excluded.debit, credit = excluded.credit;
  perform set_config('kk.ledger_internal', v_prev, true);
end; $$;

create or replace function ledger_remove(p_source text, p_source_id uuid) returns void
language plpgsql set search_path = public as $$
declare v_prev text := coalesce(current_setting('kk.ledger_internal', true), '');
begin
  perform set_config('kk.ledger_internal', 'on', true);
  delete from ledger_entries where source = p_source and source_id = p_source_id;
  perform set_config('kk.ledger_internal', v_prev, true);
end; $$;

-- BEFORE trigger on ledger_entries:
--  * auto-generated entries (from Purchase/Sale/Payment/...) can't be edited
--    or deleted directly — only through their source record, so the khata can
--    never drift out of sync with the registers;
--  * anything written directly by the app/API is always a 'manual' entry;
--  * party names are trimmed and matched (case-insensitively) to the Parties
--    list, so "allah ditta " and "Allah Ditta" land in one khata.
create or replace function ledger_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.source <> 'manual' and not kk_internal() then
    raise exception 'Yeh khata entry "%" se khud bani hai — isay wahin (asal entry) se edit/delete karein', old.source;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if not kk_internal() then
    if tg_op = 'INSERT' then
      new.source := 'manual';
      new.source_id := null;
    else
      new.source := old.source;
      new.source_id := old.source_id;
    end if;
  end if;
  new.party_type := coalesce(nullif(trim(new.party_type), ''), 'Other');
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  if new.party_name = '' then
    if kk_strict() then raise exception 'Party ka naam zaroori hai'; end if;
    new.party_name := 'Unknown';
  end if;
  new.description := coalesce(new.description, '');
  new.debit := round(coalesce(new.debit, 0), 2);
  new.credit := round(coalesce(new.credit, 0), 2);
  if new.debit < 0 or new.credit < 0 then raise exception 'Debit/Credit manfi (negative) nahi ho sakte'; end if;
  if kk_strict() and new.source = 'manual' and new.debit = 0 and new.credit = 0 then
    raise exception 'Debit ya Credit mein se kam az kam ek raqam likhein';
  end if;
  if new.date is null then new.date := pk_today(); end if;
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;

  select name into v_name from parties
   where party_type = new.party_type and lower(name) = lower(new.party_name) limit 1;
  if found then new.party_name := v_name; end if;
  return new;
end; $$;

-- AFTER trigger on ledger_entries: every party that appears in the khata is
-- automatically added to the Parties list (for autocomplete / phone numbers).
create or replace function ledger_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into parties (party_type, name, opening_date)
  values (new.party_type, new.party_name, new.date)
  on conflict (party_type, (lower(name))) do nothing;
  return null;
end; $$;

drop trigger if exists trg_ledger_before on ledger_entries;
create trigger trg_ledger_before before insert or update or delete on ledger_entries
for each row execute function ledger_before();
drop trigger if exists trg_ledger_after on ledger_entries;
create trigger trg_ledger_after after insert or update of party_type, party_name on ledger_entries
for each row execute function ledger_after();

-- Generic cleanup when a source record is deleted. TG_ARGV = source names.
create or replace function ledger_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prev text := coalesce(current_setting('kk.ledger_internal', true), '');
begin
  perform set_config('kk.ledger_internal', 'on', true);
  delete from ledger_entries where source_id = old.id and source = any(tg_argv);
  perform set_config('kk.ledger_internal', v_prev, true);
  return old;
end; $$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create or replace function settings_before() returns trigger
language plpgsql set search_path = public as $$
begin
  new.id := 1;
  new.mill_name := coalesce(nullif(trim(new.mill_name), ''), 'Jatala Rice Mills');
  new.address := coalesce(new.address, ''); new.phone := coalesce(new.phone, '');
  new.ntn := coalesce(new.ntn, ''); new.strn := coalesce(new.strn, '');
  new.invoice_footer := coalesce(new.invoice_footer, '');
  new.invoice_prefix := coalesce(new.invoice_prefix, 'INV-');
  new.slip_prefix := coalesce(new.slip_prefix, 'PS-');
  new.fumigation_days := greatest(coalesce(new.fumigation_days, 30), 1);
  new.ageing_days := greatest(coalesce(new.ageing_days, 60), 1);
  new.moisture_base_pct := greatest(coalesce(new.moisture_base_pct, 0), 0);
  new.moisture_kg_per_point := greatest(coalesce(new.moisture_kg_per_point, 0), 0);
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_settings_before on settings;
create trigger trg_settings_before before insert or update on settings
for each row execute function settings_before();

-- ---------------------------------------------------------------------------
-- Parties (Kisan, Arhti, Customer, Supplier, ...)
-- ---------------------------------------------------------------------------

-- Rename a party everywhere it is referenced (registers + khata).
create or replace function cascade_party_name(p_type text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare k text := kk_norm(p_old); v_prev text := coalesce(current_setting('kk.restoring', true), '');
begin
  if p_old is null or p_new is null or p_old = p_new then return; end if;
  perform set_config('kk.restoring', 'on', true);
  if p_type = 'Kisan' then
    update purchases set farmer_name = p_new where kk_norm(farmer_name) = k;
  elsif p_type = 'Arhti' then
    update purchases set arhti_name = p_new where kk_norm(arhti_name) = k;
    update transport_entries set party_name = p_new
     where entry_type = 'Arhti Commission' and kk_norm(party_name) = k;
  elsif p_type = 'Customer' then
    update sales set customer = p_new where kk_norm(customer) = k;
  elsif p_type = 'Labor' then
    update labor_entries set name = p_new where kk_norm(name) = k;
  elsif p_type = 'Supplier' then
    update expenses set party_name = p_new where kk_norm(party_name) = k;
    update machinery_log set party_name = p_new where kk_norm(party_name) = k;
  elsif p_type = 'Transporter' then
    update transport_entries set party_name = p_new
     where entry_type not in ('Arhti Commission', 'Broker Commission') and kk_norm(party_name) = k;
  elsif p_type = 'Broker' then
    update transport_entries set party_name = p_new
     where entry_type = 'Broker Commission' and kk_norm(party_name) = k;
  end if;
  update payments set party_name = p_new where party_type = p_type and kk_norm(party_name) = k;
  -- auto entries were re-posted by the updates above; manual ones are renamed here
  update ledger_entries set party_name = p_new
   where party_type = p_type and source = 'manual' and kk_norm(party_name) = k;
  perform set_config('kk.restoring', v_prev, true);
end; $$;

create or replace function parties_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from ledger_entries
               where party_type = old.party_type and lower(party_name) = lower(old.name)
                 and not (source = 'opening' and source_id = old.id)) then
      raise exception 'Is party ke khata mein entries maujood hain — delete nahi ho sakti (zaroorat ho to "Merge" karein)';
    end if;
    return old;
  end if;
  new.party_type := coalesce(nullif(trim(new.party_type), ''), 'Other');
  new.name := regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g');
  if kk_strict() and new.name = '' then raise exception 'Party ka naam zaroori hai'; end if;
  new.phone := trim(coalesce(new.phone, ''));
  new.address := coalesce(new.address, '');
  new.cnic := trim(coalesce(new.cnic, ''));
  new.notes := coalesce(new.notes, '');
  new.opening_balance := round(coalesce(new.opening_balance, 0), 2);
  new.opening_date := coalesce(new.opening_date, pk_today());
  new.active := coalesce(new.active, true);
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if tg_op = 'UPDATE' and new.party_type <> old.party_type then
    if exists (select 1 from ledger_entries
               where party_type = old.party_type and lower(party_name) = lower(old.name)
                 and not (source = 'opening' and source_id = old.id)) then
      raise exception 'Jis party ke khata mein entries hon us ki type badli nahi ja sakti';
    end if;
  end if;
  return new;
end; $$;

create or replace function parties_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform ledger_remove('opening', old.id);
    return null;
  end if;
  if tg_op = 'UPDATE' and new.name is distinct from old.name and new.party_type = old.party_type then
    perform cascade_party_name(new.party_type, old.name, new.name);
  end if;
  if new.opening_balance <> 0 then
    perform ledger_upsert('opening', new.id, new.opening_date, new.party_type, new.name,
      'Opening Balance (pichla hisaab)',
      case when new.opening_balance < 0 then -new.opening_balance else 0 end,
      case when new.opening_balance > 0 then new.opening_balance else 0 end);
  else
    perform ledger_remove('opening', new.id);
  end if;
  return null;
end; $$;

drop trigger if exists trg_parties_before on parties;
create trigger trg_parties_before before insert or update or delete on parties
for each row execute function parties_before();
drop trigger if exists trg_parties_after on parties;
create trigger trg_parties_after after insert or update or delete on parties
for each row execute function parties_after();

-- Merge a duplicate party into another (e.g. "Allah Dita" -> "Allah Ditta").
create or replace function merge_party(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a parties; b parties;
begin
  if not (can_do('parties', 'edit') and can_do('ledger', 'edit')) then
    raise exception 'Party merge karne ki ijazat nahi';
  end if;
  select * into a from parties where id = p_from;
  select * into b from parties where id = p_into;
  if a.id is null or b.id is null then raise exception 'Party nahi mili'; end if;
  if a.id = b.id then raise exception 'Dono parties ek hi hain'; end if;
  if a.party_type <> b.party_type then raise exception 'Sirf ek hi type ki parties merge ho sakti hain'; end if;
  perform ledger_remove('opening', a.id);
  perform cascade_party_name(a.party_type, a.name, b.name);
  update parties set opening_balance = b.opening_balance + a.opening_balance,
         phone = case when b.phone = '' then a.phone else b.phone end,
         address = case when b.address = '' then a.address else b.address end,
         cnic = case when b.cnic = '' then a.cnic else b.cnic end
   where id = b.id;
  delete from parties where id = a.id;
end; $$;


-- ---------------------------------------------------------------------------
-- Products (maal: chawal, kanki, phak, toori...) and Varieties (Super Basmati,
-- 1121...). Managed by the Owner / Munshi from the "Products & Varieties"
-- page; a new item appears in Production, Sales and Stock automatically.
-- Records store the NAME, so a rename is cascaded everywhere.
-- ---------------------------------------------------------------------------

create or replace function cascade_variety_name(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare v_prev text := coalesce(current_setting('kk.restoring', true), '');
begin
  if p_old is null or p_new is null or p_old = p_new then return; end if;
  perform set_config('kk.restoring', 'on', true);
  update purchases set variety = p_new where lower(variety) = lower(p_old);
  update production_batches set variety = p_new where lower(variety) = lower(p_old);
  update sales set variety = p_new where lower(variety) = lower(p_old);
  update stock_adjustments set variety = p_new where lower(variety) = lower(p_old);
  update stock_lots set variety = p_new where lower(variety) = lower(p_old);
  perform set_config('kk.restoring', v_prev, true);
end; $$;

create or replace function cascade_product_name(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
declare v_prev text := coalesce(current_setting('kk.restoring', true), '');
begin
  if p_old is null or p_new is null or p_old = p_new then return; end if;
  perform set_config('kk.restoring', 'on', true);
  update sales set item = p_new where lower(item) = lower(p_old);
  update stock_adjustments set item = p_new where lower(item) = lower(p_old);
  update stock_lots set item = p_new where lower(item) = lower(p_old);
  update production_batches b
     set outputs = (select coalesce(jsonb_agg(case when lower(e->>'product') = lower(p_old)
                                                   then jsonb_set(e, '{product}', to_jsonb(p_new)) else e end), '[]'::jsonb)
                    from jsonb_array_elements(b.outputs) e)
   where exists (select 1 from jsonb_array_elements(b.outputs) e where lower(e->>'product') = lower(p_old));
  perform set_config('kk.restoring', v_prev, true);
end; $$;

create or replace function product_in_use(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sales where lower(item) = lower(p_name))
      or exists (select 1 from stock_adjustments where lower(item) = lower(p_name))
      or exists (select 1 from stock_lots where lower(item) = lower(p_name))
      or exists (select 1 from production_batches b, jsonb_array_elements(b.outputs) e where lower(e->>'product') = lower(p_name));
$$;

create or replace function variety_in_use(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from purchases where lower(variety) = lower(p_name))
      or exists (select 1 from production_batches where lower(variety) = lower(p_name))
      or exists (select 1 from sales where lower(variety) = lower(p_name))
      or exists (select 1 from stock_adjustments where lower(variety) = lower(p_name))
      or exists (select 1 from stock_lots where lower(variety) = lower(p_name));
$$;

create or replace function products_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.category = 'paddy' then raise exception 'Paddy product hataya nahi ja sakta (har kharid isi mein jaati hai)'; end if;
    if product_in_use(old.name) then
      raise exception 'Yeh product entries mein istemal ho chuka hai — delete nahi ho sakta (Inactive ya Merge karein)';
    end if;
    return old;
  end if;
  new.name := regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g');
  if new.name = '' then raise exception 'Product ka naam zaroori hai'; end if;
  new.category := case when new.category in ('paddy','rice','broken','byproduct','other') then new.category else 'other' end;
  new.has_variety := coalesce(new.has_variety, true);
  new.sale_unit := case when new.sale_unit = 'kg' then 'kg' else 'maund' end;
  new.active := coalesce(new.active, true);
  new.sort_order := coalesce(new.sort_order, 100);
  new.notes := coalesce(new.notes, '');
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if tg_op = 'UPDATE' and old.category = 'paddy'
     and (new.name <> old.name or new.category <> 'paddy' or not new.active) then
    raise exception 'Paddy product ka naam/qisam nahi badla ja sakta — nayi qisam ke liye Variety add karein';
  end if;
  if new.category = 'paddy' and exists (select 1 from products where category = 'paddy' and id <> new.id) then
    raise exception 'Paddy sirf ek hi product hai — paddy ki nayi qisam ke liye Variety add karein';
  end if;
  return new;
end; $$;

create or replace function products_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then perform cascade_product_name(old.name, new.name); end if;
  return null;
end; $$;

create or replace function varieties_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if variety_in_use(old.name) then
      raise exception 'Yeh variety entries mein istemal ho chuki hai — delete nahi ho sakti (Inactive ya Merge karein)';
    end if;
    return old;
  end if;
  new.name := regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g');
  if new.name = '' then raise exception 'Variety ka naam zaroori hai'; end if;
  new.active := coalesce(new.active, true);
  new.sort_order := coalesce(new.sort_order, 100);
  new.notes := coalesce(new.notes, '');
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  return new;
end; $$;

create or replace function varieties_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then perform cascade_variety_name(old.name, new.name); end if;
  return null;
end; $$;

drop trigger if exists trg_products_before on products;
create trigger trg_products_before before insert or update or delete on products
for each row execute function products_before();
drop trigger if exists trg_products_after on products;
create trigger trg_products_after after update of name on products
for each row execute function products_after();
drop trigger if exists trg_varieties_before on varieties;
create trigger trg_varieties_before before insert or update or delete on varieties
for each row execute function varieties_before();
drop trigger if exists trg_varieties_after on varieties;
create trigger trg_varieties_after after update of name on varieties
for each row execute function varieties_after();

-- Duplicate / typo'd names: move everything to the right one, then remove it
create or replace function merge_product(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a products; b products;
begin
  if not can_do('products', 'edit') then raise exception 'Products badalne ki ijazat nahi'; end if;
  select * into a from products where id = p_from;
  select * into b from products where id = p_into;
  if a.id is null or b.id is null then raise exception 'Product nahi mila'; end if;
  if a.id = b.id then raise exception 'Dono ek hi product hain'; end if;
  if a.category = 'paddy' or b.category = 'paddy' then raise exception 'Paddy product merge nahi hota'; end if;
  perform cascade_product_name(a.name, b.name);
  delete from products where id = a.id;
end; $$;

create or replace function merge_variety(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a varieties; b varieties;
begin
  if not can_do('products', 'edit') then raise exception 'Varieties badalne ki ijazat nahi'; end if;
  select * into a from varieties where id = p_from;
  select * into b from varieties where id = p_into;
  if a.id is null or b.id is null then raise exception 'Variety nahi mili'; end if;
  if a.id = b.id then raise exception 'Dono ek hi variety hain'; end if;
  perform cascade_variety_name(a.name, b.name);
  delete from varieties where id = a.id;
end; $$;

-- ---------------------------------------------------------------------------
-- Auto-calculations (BEFORE triggers). The browser shows the same maths live,
-- but the database is the final authority, so CSV imports / old app versions
-- can never save a wrong total.
-- ---------------------------------------------------------------------------

create or replace function purchases_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prefix text;
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.mode := case when new.mode = 'Arhti' then 'Arhti' else 'Direct' end;
  new.farmer_name := regexp_replace(trim(coalesce(new.farmer_name, '')), '\s+', ' ', 'g');
  new.arhti_name := regexp_replace(trim(coalesce(new.arhti_name, '')), '\s+', ' ', 'g');
  new.variety := coalesce(nullif(trim(new.variety), ''), 'Other');
  new.vehicle_no := upper(trim(coalesce(new.vehicle_no, '')));
  new.notes := coalesce(new.notes, '');
  -- Whose khata does this purchase go to? Direct -> Kisan. Via Arhti -> the
  -- Arhti by default, or the Kisan if the mill settles with the farmer itself.
  new.khata_of := case when new.mode = 'Direct' then 'Kisan'
                       when new.khata_of = 'Kisan' then 'Kisan' else 'Arhti' end;
  if kk_strict() and new.khata_of = 'Kisan' and new.farmer_name = '' then raise exception 'Kisan ka naam zaroori hai'; end if;
  if kk_strict() and new.mode = 'Arhti' and new.arhti_name = '' then raise exception 'Arhti mode mein Arhti ka naam zaroori hai'; end if;

  new.bags := coalesce(new.bags, 0);
  new.gross_wt := coalesce(new.gross_wt, 0);
  new.tare_wt := coalesce(new.tare_wt, 0);
  new.bag_wt_kg := coalesce(new.bag_wt_kg, 0);
  new.deduction_kg := coalesce(new.deduction_kg, 0);
  new.moisture_pct := coalesce(new.moisture_pct, 0);
  new.broken_pct := coalesce(new.broken_pct, 0);
  new.fm_pct := coalesce(new.fm_pct, 0);
  new.rate_per_maund := coalesce(new.rate_per_maund, 0);
  new.commission_pct := coalesce(new.commission_pct, 0);
  new.labor_charges := coalesce(new.labor_charges, 0);
  new.advance_applied := coalesce(new.advance_applied, 0);
  if kk_strict() and (new.bags < 0 or new.gross_wt < 0 or new.tare_wt < 0 or new.bag_wt_kg < 0 or new.deduction_kg < 0
     or new.rate_per_maund < 0 or new.commission_pct < 0 or new.labor_charges < 0 or new.advance_applied < 0) then
    raise exception 'Koi bhi weight/raqam manfi (negative) nahi ho sakti';
  end if;

  new.net_wt := round(new.gross_wt - new.tare_wt - new.bags * new.bag_wt_kg - new.deduction_kg, 2);
  if kk_strict() and new.net_wt <= 0 then
    raise exception 'Net weight zero ya manfi aa raha hai — Gross, Tare aur katoti check karein';
  end if;
  new.amount := round(new.net_wt / 40.0 * new.rate_per_maund, 2);
  new.commission_amount := round(new.amount * new.commission_pct / 100.0, 2);
  new.total_payable := round(new.amount + new.commission_amount - new.labor_charges, 2);
  new.net_payable := round(new.total_payable - new.advance_applied, 2);

  if kk_strict() and new.contract_id is not null
     and not exists (select 1 from contracts where id = new.contract_id and kind = 'purchase') then
    raise exception 'Yeh sauda kharid (purchase) ka nahi';
  end if;

  new.slip_no := trim(coalesce(new.slip_no, ''));
  if new.slip_no = '' then
    if tg_op = 'UPDATE' and coalesce(old.slip_no, '') <> '' then
      new.slip_no := old.slip_no;
    else
      select slip_prefix into v_prefix from settings where id = 1;
      new.slip_no := coalesce(v_prefix, 'PS-') || lpad(next_doc_no('purchase_slip')::text, 5, '0');
    end if;
  end if;
  return new;
end; $$;

create or replace function sales_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_units numeric;
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.customer := regexp_replace(trim(coalesce(new.customer, '')), '\s+', ' ', 'g');
  if kk_strict() and new.customer = '' then raise exception 'Customer ka naam zaroori hai'; end if;
  new.type := case when new.type = 'Export' then 'Export' else 'Local' end;
  new.item := coalesce(nullif(trim(new.item), ''), 'Other');
  new.variety := trim(coalesce(new.variety, ''));
  new.rate_unit := case when new.rate_unit in ('maund', 'mt') then new.rate_unit else 'kg' end;
  new.currency := upper(coalesce(nullif(trim(new.currency), ''), 'PKR'));
  new.fx_rate := case when new.currency = 'PKR' then 1 else coalesce(new.fx_rate, 0) end;
  new.vehicle_no := upper(trim(coalesce(new.vehicle_no, '')));
  new.container_no := coalesce(new.container_no, '');
  new.notes := coalesce(new.notes, '');
  new.buyer_ref := coalesce(new.buyer_ref, '');
  new.destination := coalesce(new.destination, '');
  new.port_loading := coalesce(new.port_loading, '');
  new.port_discharge := coalesce(new.port_discharge, '');
  new.vessel := coalesce(new.vessel, '');
  new.bl_no := coalesce(new.bl_no, '');
  new.lc_no := coalesce(new.lc_no, '');
  new.payment_terms := coalesce(new.payment_terms, '');
  new.packing := coalesce(new.packing, '');
  new.gross_weight_kg := coalesce(new.gross_weight_kg, 0);
  new.bags := coalesce(new.bags, 0);
  new.qty_kg := coalesce(new.qty_kg, 0);
  new.rate := coalesce(new.rate, 0);
  new.tax_pct := coalesce(new.tax_pct, 0);
  new.received_now := coalesce(new.received_now, 0);
  if kk_strict() and new.qty_kg <= 0 then raise exception 'Quantity (kg) zero se zyada honi chahiye'; end if;
  if kk_strict() and (new.rate < 0 or new.tax_pct < 0 or new.received_now < 0 or new.bags < 0 or new.gross_weight_kg < 0) then
    raise exception 'Rate/Tax/Raqam manfi (negative) nahi ho sakti';
  end if;
  if kk_strict() and new.fx_rate <= 0 then
    raise exception 'Exchange rate likhein (1 % = kitne Rupay)', new.currency;
  end if;
  if kk_strict() and new.contract_id is not null
     and not exists (select 1 from contracts where id = new.contract_id and kind = 'sale') then
    raise exception 'Yeh sauda sale ka nahi';
  end if;
  v_units := case new.rate_unit when 'maund' then new.qty_kg / 40.0 when 'mt' then new.qty_kg / 1000.0 else new.qty_kg end;
  new.amount_fc := round(v_units * new.rate, 2);
  new.amount := round(new.amount_fc * greatest(new.fx_rate, 0), 2);
  new.tax_amount := round(new.amount * new.tax_pct / 100.0, 2);
  new.net_amount := round(new.amount + new.tax_amount, 2);

  new.invoice_no := trim(coalesce(new.invoice_no, ''));
  if new.invoice_no = '' then
    if tg_op = 'UPDATE' and coalesce(old.invoice_no, '') <> '' then
      new.invoice_no := old.invoice_no;
    else
      select invoice_prefix into v_prefix from settings where id = 1;
      new.invoice_no := coalesce(v_prefix, 'INV-') || lpad(next_doc_no('sale_invoice')::text, 5, '0');
    end if;
  end if;
  return new;
end; $$;

create or replace function payments_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.party_type := coalesce(nullif(trim(new.party_type), ''), 'Other');
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  if kk_strict() and new.party_name = '' then raise exception 'Party ka naam zaroori hai'; end if;
  new.direction := case when new.direction = 'Received' then 'Received' else 'Paid' end;
  new.method := case when new.method in ('Cash','Bank','Cheque','Online') then new.method else 'Cash' end;
  new.amount := round(coalesce(new.amount, 0), 2);
  if kk_strict() and new.amount <= 0 then raise exception 'Raqam zero se zyada honi chahiye'; end if;
  new.cheque_no := trim(coalesce(new.cheque_no, ''));
  new.bank_name := trim(coalesce(new.bank_name, ''));
  new.notes := coalesce(new.notes, '');
  if new.method = 'Cheque' then
    new.status := case when new.status in ('Pending','Cleared','Bounced') then new.status else 'Pending' end;
    new.due_date := coalesce(new.due_date, new.date);
  else
    new.status := 'Cleared';
    new.due_date := new.date;
  end if;
  return new;
end; $$;

create or replace function production_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_legacy numeric;
  v_use_legacy boolean;
  o record;
  v_rice numeric := 0;
  v_broken numeric := 0;
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.lot_no := trim(coalesce(new.lot_no, ''));
  if kk_strict() and new.lot_no = '' then raise exception 'Lot number zaroori hai'; end if;
  new.process := coalesce(nullif(trim(new.process), ''), 'Raw');
  new.variety := trim(coalesce(new.variety, ''));
  new.notes := coalesce(new.notes, '');
  new.paddy_input_kg := coalesce(new.paddy_input_kg, 0);
  new.rice_output_kg := coalesce(new.rice_output_kg, 0);
  new.kanki25 := coalesce(new.kanki25, 0);
  new.kanki50 := coalesce(new.kanki50, 0);
  new.kanki100 := coalesce(new.kanki100, 0);
  new.bran_kg := coalesce(new.bran_kg, 0);
  new.husk_kg := coalesce(new.husk_kg, 0);
  new.wastage_kg := coalesce(new.wastage_kg, 0);
  if kk_strict() and new.paddy_input_kg <= 0 then raise exception 'Paddy input zero se zyada honi chahiye'; end if;
  if kk_strict() and new.wastage_kg < 0 then raise exception 'Wastage manfi (negative) nahi ho sakta'; end if;

  new.outputs := coalesce(new.outputs, '[]'::jsonb);
  if jsonb_typeof(new.outputs) <> 'array' then new.outputs := '[]'::jsonb; end if;

  -- Entries written by v4 / old app versions (and old backups / CSVs) only
  -- have the fixed columns: turn them into output lines.
  v_legacy := new.rice_output_kg + new.kanki25 + new.kanki50 + new.kanki100 + new.bran_kg + new.husk_kg;
  v_use_legacy := jsonb_array_length(new.outputs) = 0 and v_legacy > 0 and (
    tg_op = 'INSERT'
    or jsonb_array_length(coalesce(old.outputs, '[]'::jsonb)) = 0
    or new.rice_output_kg is distinct from old.rice_output_kg or new.kanki25 is distinct from old.kanki25
    or new.kanki50 is distinct from old.kanki50 or new.kanki100 is distinct from old.kanki100
    or new.bran_kg is distinct from old.bran_kg or new.husk_kg is distinct from old.husk_kg);
  if v_use_legacy then
    select coalesce(jsonb_agg(jsonb_build_object('product', x.p, 'qty_kg', x.q)), '[]'::jsonb) into new.outputs
    from (values ('Rice - Full Grain', new.rice_output_kg), ('Kanki 25%', new.kanki25), ('Kanki 50%', new.kanki50),
                 ('Kanki 100%', new.kanki100), ('Bran/Chokar', new.bran_kg), ('Husk/Tuti', new.husk_kg)) x(p, q)
    where x.q > 0;
  end if;

  -- One line per product, products-list spelling, no empty lines
  for o in
    select coalesce(pr.name, trim(e->>'product')) as product,
           sum(round(coalesce(nullif(trim(e->>'qty_kg'), '')::numeric, 0), 2)) as qty,
           min(coalesce(pr.sort_order, 999)) as so,
           bool_or(pr.id is null) as unknown,
           min(coalesce(pr.category, 'other')) as category
    from jsonb_array_elements(new.outputs) e
    left join products pr on lower(pr.name) = lower(trim(e->>'product'))
    where coalesce(trim(e->>'product'), '') <> ''
    group by 1
    order by 3, 1
  loop
    if o.qty = 0 then continue; end if;
    if kk_strict() and o.qty < 0 then raise exception 'Output manfi (negative) nahi ho sakta (%)', o.product; end if;
    if kk_strict() and o.unknown then
      raise exception 'Product "%" list mein nahi — pehle "Products & Varieties" mein add karein', o.product;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('product', o.product, 'qty_kg', o.qty));
    if o.category = 'rice' then v_rice := v_rice + o.qty; end if;
    if o.category = 'broken' then v_broken := v_broken + o.qty; end if;
  end loop;
  new.outputs := v_out;

  -- Old fixed columns kept filled for older reports / CSV exports
  new.rice_output_kg := round(v_rice, 2);
  new.kanki25 := round(coalesce((select sum((e->>'qty_kg')::numeric) from jsonb_array_elements(v_out) e where e->>'product' = 'Kanki 25%'), 0), 2);
  new.kanki50 := round(coalesce((select sum((e->>'qty_kg')::numeric) from jsonb_array_elements(v_out) e where e->>'product' = 'Kanki 50%'), 0), 2);
  new.kanki100 := round(coalesce((select sum((e->>'qty_kg')::numeric) from jsonb_array_elements(v_out) e where e->>'product' = 'Kanki 100%'), 0), 2);
  new.bran_kg := round(coalesce((select sum((e->>'qty_kg')::numeric) from jsonb_array_elements(v_out) e where e->>'product' = 'Bran/Chokar'), 0), 2);
  new.husk_kg := round(coalesce((select sum((e->>'qty_kg')::numeric) from jsonb_array_elements(v_out) e where e->>'product' = 'Husk/Tuti'), 0), 2);

  if kk_strict() and v_rice + v_broken > new.paddy_input_kg then
    raise exception 'Chawal ka output paddy input se zyada nahi ho sakta (recovery 100%% se upar)';
  end if;
  new.recovery_pct := case when new.paddy_input_kg > 0
                           then round((v_rice + v_broken) / new.paddy_input_kg * 100, 2) else 0 end;
  return new;
end; $$;

create or replace function stock_lots_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  new.godown := trim(coalesce(new.godown, ''));
  new.lot_no := trim(coalesce(new.lot_no, ''));
  if kk_strict() and (new.godown = '' or new.lot_no = '') then raise exception 'Godown aur Lot number zaroori hain'; end if;
  new.item := coalesce(nullif(trim(new.item), ''), 'Other');
  new.variety := trim(coalesce(new.variety, ''));
  new.status := case when new.status = 'Empty' then 'Empty' else 'In Stock' end;
  new.notes := coalesce(new.notes, '');
  new.date_in := coalesce(new.date_in, pk_today());
  new.bags := coalesce(new.bags, 0);
  new.weight_per_bag_kg := coalesce(new.weight_per_bag_kg, 0);
  if kk_strict() and (new.bags < 0 or new.weight_per_bag_kg < 0) then raise exception 'Bags/weight manfi nahi ho sakte'; end if;
  new.total_weight_kg := round(new.bags * new.weight_per_bag_kg, 2);
  return new;
end; $$;

create or replace function stock_adjustments_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.item := coalesce(nullif(trim(new.item), ''), 'Other');
  new.variety := case when new.item in ('Bran/Chokar','Husk/Tuti') then '' else trim(coalesce(new.variety, '')) end;
  new.direction := case when new.direction = 'Out' then 'Out' else 'In' end;
  new.qty_kg := round(coalesce(new.qty_kg, 0), 2);
  if kk_strict() and new.qty_kg <= 0 then raise exception 'Quantity zero se zyada honi chahiye'; end if;
  new.reason := coalesce(nullif(trim(new.reason), ''), 'Other');
  new.notes := coalesce(new.notes, '');
  return new;
end; $$;

create or replace function labor_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.name := regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g');
  if kk_strict() and new.name = '' then raise exception 'Mazdoor ka naam zaroori hai'; end if;
  new.pay_type := case when new.pay_type in ('Daily','Piece','Monthly') then new.pay_type else 'Daily' end;
  new.rate_or_wage := coalesce(new.rate_or_wage, 0);
  new.units_or_days := coalesce(new.units_or_days, 0);
  new.advance_deducted := coalesce(new.advance_deducted, 0);
  if kk_strict() and (new.rate_or_wage < 0 or new.units_or_days < 0 or new.advance_deducted < 0) then
    raise exception 'Raqam/din manfi (negative) nahi ho sakte';
  end if;
  new.gross := round(new.rate_or_wage * new.units_or_days, 2);
  new.net_pay := round(new.gross - new.advance_deducted, 2);
  new.paid := coalesce(new.paid, false);
  new.paid_via := case when new.paid_via = 'Bank' then 'Bank' else 'Cash' end;
  new.notes := coalesce(new.notes, '');
  if new.paid then
    new.paid_date := coalesce(new.paid_date, pk_today());
  else
    new.paid_date := null;
  end if;
  return new;
end; $$;

create or replace function transport_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.entry_type := coalesce(nullif(trim(new.entry_type), ''), 'Delivery');
  new.vehicle_no := upper(trim(coalesce(new.vehicle_no, '')));
  new.driver_name := trim(coalesce(new.driver_name, ''));
  new.from_location := coalesce(new.from_location, '');
  new.to_location := coalesce(new.to_location, '');
  new.item := coalesce(new.item, '');
  new.notes := coalesce(new.notes, '');
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  new.paid_via := case when new.paid_via in ('Cash','Bank','Udhaar') then new.paid_via else 'Cash' end;
  new.qty_kg := coalesce(new.qty_kg, 0);
  new.freight_rate_per_kg := coalesce(new.freight_rate_per_kg, 0);
  new.commission_base_amount := coalesce(new.commission_base_amount, 0);
  new.commission_pct := coalesce(new.commission_pct, 0);
  if kk_strict() and (new.qty_kg < 0 or new.freight_rate_per_kg < 0 or new.commission_base_amount < 0 or new.commission_pct < 0) then
    raise exception 'Raqam/weight manfi (negative) nahi ho sakte';
  end if;
  new.freight_amount := round(new.qty_kg * new.freight_rate_per_kg, 2);
  new.commission_amount := round(new.commission_base_amount * new.commission_pct / 100.0, 2);
  new.total_amount := round(new.freight_amount + new.commission_amount, 2);
  if kk_strict() and new.paid_via = 'Udhaar' and new.party_name = '' then
    raise exception 'Udhaar ke liye Transporter/Party ka naam zaroori hai';
  end if;
  return new;
end; $$;

create or replace function machinery_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.machine := coalesce(nullif(trim(new.machine), ''), 'Other');
  new.issue_description := coalesce(new.issue_description, '');
  new.action_taken := coalesce(new.action_taken, '');
  new.status := case when new.status = 'Under Repair' then 'Under Repair' else 'Operational' end;
  new.cost := round(coalesce(new.cost, 0), 2);
  if kk_strict() and new.cost < 0 then raise exception 'Cost manfi (negative) nahi ho sakti'; end if;
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  new.paid_via := case when new.paid_via in ('Cash','Bank','Udhaar') then new.paid_via else 'Cash' end;
  if kk_strict() and new.paid_via = 'Udhaar' and new.cost > 0 and new.party_name = '' then
    raise exception 'Udhaar ke liye Supplier/Workshop ka naam zaroori hai';
  end if;
  return new;
end; $$;

create or replace function expenses_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.category := coalesce(nullif(trim(new.category), ''), 'Other');
  new.description := coalesce(new.description, '');
  new.amount := round(coalesce(new.amount, 0), 2);
  if kk_strict() and new.amount <= 0 then raise exception 'Raqam zero se zyada honi chahiye'; end if;
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  new.paid_via := case when new.paid_via in ('Cash','Bank','Udhaar') then new.paid_via else 'Cash' end;
  if kk_strict() and new.paid_via = 'Udhaar' and new.party_name = '' then
    raise exception 'Udhaar ke liye Supplier (jaise petrol pump) ka naam zaroori hai';
  end if;
  return new;
end; $$;

create or replace function tax_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.tax_type := coalesce(nullif(trim(new.tax_type), ''), 'Sales Tax/GST');
  new.reference := coalesce(new.reference, '');
  new.notes := coalesce(new.notes, '');
  new.status := case when new.status in ('Pending','Filed','Paid') then new.status else 'Pending' end;
  new.taxable_amount := coalesce(new.taxable_amount, 0);
  new.tax_pct := coalesce(new.tax_pct, 0);
  new.tax_amount := round(new.taxable_amount * new.tax_pct / 100.0, 2);
  return new;
end; $$;

create or replace function zakat_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  new.assessment_date := coalesce(new.assessment_date, pk_today());
  new.cash_in_hand := coalesce(new.cash_in_hand, 0);
  new.bank_balance := coalesce(new.bank_balance, 0);
  new.stock_value := coalesce(new.stock_value, 0);
  new.receivables := coalesce(new.receivables, 0);
  new.payables := coalesce(new.payables, 0);
  new.nisab_threshold := coalesce(new.nisab_threshold, 0);
  new.paid_amount := coalesce(new.paid_amount, 0);
  new.notes := coalesce(new.notes, '');
  v := new.cash_in_hand + new.bank_balance + new.stock_value + new.receivables - new.payables;
  new.zakatable_amount := round(greatest(v, 0), 2);
  new.zakat_due := case when v > 0 and v >= new.nisab_threshold then round(v * 0.025, 2) else 0 end;
  return new;
end; $$;

create or replace function cash_entries_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.account := case when new.account = 'Bank' then 'Bank' else 'Cash' end;
  new.direction := case when new.direction = 'Out' then 'Out' else 'In' end;
  new.category := coalesce(nullif(trim(new.category), ''), 'Other Income');
  -- transfers always move money from one account to the other
  if new.category = 'Cash to Bank' then new.account := 'Cash'; new.direction := 'Out'; end if;
  if new.category = 'Bank to Cash' then new.account := 'Bank'; new.direction := 'Out'; end if;
  new.amount := round(coalesce(new.amount, 0), 2);
  if kk_strict() and new.amount <= 0 then raise exception 'Raqam zero se zyada honi chahiye'; end if;
  new.description := coalesce(new.description, '');
  return new;
end; $$;


create or replace function contracts_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.kind := case when new.kind = 'purchase' then 'purchase' else 'sale' end;
  new.party_type := case when new.kind = 'sale' then 'Customer'
                         when new.party_type in ('Kisan', 'Arhti') then new.party_type else 'Arhti' end;
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  if kk_strict() and new.party_name = '' then raise exception 'Party ka naam zaroori hai'; end if;
  new.item := case when new.kind = 'purchase' then 'Paddy' else coalesce(nullif(trim(new.item), ''), 'Other') end;
  new.variety := trim(coalesce(new.variety, ''));
  new.qty_kg := round(coalesce(new.qty_kg, 0), 2);
  new.rate := coalesce(new.rate, 0);
  if kk_strict() and new.qty_kg <= 0 then raise exception 'Saude ki miqdar (kg) likhein'; end if;
  if kk_strict() and new.rate < 0 then raise exception 'Rate manfi (negative) nahi ho sakta'; end if;
  new.rate_unit := case when new.rate_unit in ('kg', 'mt') then new.rate_unit else 'maund' end;
  new.currency := upper(coalesce(nullif(trim(new.currency), ''), 'PKR'));
  new.fx_rate := case when new.currency = 'PKR' then 1 else coalesce(nullif(new.fx_rate, 0), 1) end;
  new.payment_terms := coalesce(new.payment_terms, '');
  new.status := case when new.status in ('Open', 'Completed', 'Cancelled') then new.status else 'Open' end;
  new.notes := coalesce(new.notes, '');
  if kk_strict() and new.delivery_from is not null and new.delivery_to is not null and new.delivery_to < new.delivery_from then
    raise exception 'Delivery ki aakhri tareekh shuru se pehle nahi ho sakti';
  end if;
  if tg_op = 'UPDATE' and new.kind <> old.kind
     and exists (select 1 from sales where contract_id = new.id union all select 1 from purchases where contract_id = new.id) then
    raise exception 'Jis saude par maal aa/ja chuka ho us ki qisam nahi badal sakti';
  end if;
  new.contract_no := trim(coalesce(new.contract_no, ''));
  if new.contract_no = '' then
    if tg_op = 'UPDATE' and coalesce(old.contract_no, '') <> '' then
      new.contract_no := old.contract_no;
    else
      new.contract_no := case when new.kind = 'sale' then 'SC-' else 'PC-' end
        || lpad(next_doc_no(case when new.kind = 'sale' then 'sale_contract' else 'purchase_contract' end)::text, 5, '0');
    end if;
  end if;
  return new;
end; $$;

create or replace function weighments_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.kind := case when new.kind in ('Purchase', 'Sale', 'Public') then new.kind else 'Purchase' end;
  new.vehicle_no := upper(regexp_replace(trim(coalesce(new.vehicle_no, '')), '\s+', ' ', 'g'));
  if kk_strict() and new.vehicle_no = '' then raise exception 'Gaari number zaroori hai'; end if;
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  new.item := trim(coalesce(new.item, ''));
  new.notes := coalesce(new.notes, '');
  new.first_wt := round(coalesce(new.first_wt, 0), 2);
  new.fee := round(coalesce(new.fee, 0), 2);
  if kk_strict() and new.first_wt <= 0 then raise exception 'Pehla wazan (kg) likhein'; end if;
  if kk_strict() and (new.fee < 0 or coalesce(new.second_wt, 0) < 0) then raise exception 'Wazan / fee manfi (negative) nahi ho sakti'; end if;
  new.first_at := coalesce(new.first_at, now());
  if new.second_wt is not null and new.second_wt > 0 then
    new.second_wt := round(new.second_wt, 2);
    new.second_at := coalesce(new.second_at, now());
    new.net_wt := round(abs(new.first_wt - new.second_wt), 2);
    new.status := 'Done';
  else
    new.second_wt := null;
    new.second_at := null;
    new.net_wt := 0;
    new.status := 'Open';
  end if;
  new.slip_no := trim(coalesce(new.slip_no, ''));
  if new.slip_no = '' then
    if tg_op = 'UPDATE' and coalesce(old.slip_no, '') <> '' then
      new.slip_no := old.slip_no;
    else
      new.slip_no := 'WB-' || lpad(next_doc_no('weighment')::text, 5, '0');
    end if;
  end if;
  return new;
end; $$;

-- Period lock ("hisaab band"): nothing dated on/before settings.lock_date can
-- be added, changed or deleted — by anyone, including the Owner, until the
-- Owner moves the lock date. TG_ARGV[0] = the row's date column; further
-- arguments = columns that may still change on a locked row (cheque status,
-- wage paid flag...). Restores and internal re-postings are exempt.
create or replace function kk_check_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lock date;
  v_new date;
  v_old date;
  v_only_allowed boolean;
begin
  if not kk_strict() or kk_internal() then return coalesce(new, old); end if;
  select lock_date into v_lock from settings where id = 1;
  if v_lock is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and tg_nargs > 1 then
    select coalesce(bool_and(n.key = any (tg_argv[1:tg_nargs - 1])), true) into v_only_allowed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key);
    if v_only_allowed then return new; end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := nullif(to_jsonb(new) ->> tg_argv[0], '')::date; end if;
  if tg_op in ('UPDATE', 'DELETE') then v_old := nullif(to_jsonb(old) ->> tg_argv[0], '')::date; end if;
  if (v_new is not null and v_new <= v_lock) or (v_old is not null and v_old <= v_lock) then
    raise exception 'Hisaab % tak band (lock) hai — is tareekh ki entry daal, badal ya hata nahi sakte. Owner "Mill Settings" mein lock ki tareekh badal sakta hai.',
      to_char(v_lock, 'DD-MM-YYYY');
  end if;
  return coalesce(new, old);
end; $$;


-- Sukhai (drying): wet paddy loses weight; the loss leaves the paddy stock
create or replace function drying_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.variety := trim(coalesce(new.variety, ''));
  new.lot_ref := trim(coalesce(new.lot_ref, ''));
  new.method := coalesce(nullif(trim(new.method), ''), 'Dhoop (sun)');
  new.notes := coalesce(new.notes, '');
  new.weight_before_kg := round(coalesce(new.weight_before_kg, 0), 2);
  new.weight_after_kg := round(coalesce(new.weight_after_kg, 0), 2);
  new.moisture_before := coalesce(new.moisture_before, 0);
  new.moisture_after := coalesce(new.moisture_after, 0);
  if kk_strict() and new.weight_before_kg <= 0 then raise exception 'Sukhai se pehle ka wazan likhein'; end if;
  if kk_strict() and new.weight_after_kg <= 0 then raise exception 'Sukhai ke baad ka wazan likhein'; end if;
  if kk_strict() and new.weight_after_kg > new.weight_before_kg then
    raise exception 'Sukhai ke baad wazan pehle se zyada nahi ho sakta';
  end if;
  if kk_strict() and new.variety = '' then raise exception 'Paddy ki variety chunein'; end if;
  new.loss_kg := round(greatest(new.weight_before_kg - new.weight_after_kg, 0), 2);
  return new;
end; $$;

-- Bardana (bags): given to Arhti/Kisan before harvest, returned with paddy.
-- Optionally charged: then the bag value goes into the party's khata.
create or replace function bags_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.created_at is null then new.created_at := now(); end if;
  if new.date is null then new.date := pk_today(); end if;
  new.movement := case when new.movement in ('Purchased', 'Issued', 'Returned', 'Used') then new.movement else 'Issued' end;
  new.party_type := coalesce(nullif(trim(new.party_type), ''), 'Arhti');
  new.party_name := regexp_replace(trim(coalesce(new.party_name, '')), '\s+', ' ', 'g');
  new.bag_type := coalesce(nullif(trim(new.bag_type), ''), 'Jute');
  new.qty := coalesce(new.qty, 0);
  new.rate := round(coalesce(new.rate, 0), 2);
  new.charge_to_party := coalesce(new.charge_to_party, false) and new.movement in ('Issued', 'Returned');
  new.notes := coalesce(new.notes, '');
  if kk_strict() and new.qty <= 0 then raise exception 'Boriyon ki tadaad likhein'; end if;
  if kk_strict() and new.rate < 0 then raise exception 'Rate manfi nahi ho sakta'; end if;
  if kk_strict() and new.movement in ('Issued', 'Returned') and new.party_name = '' then
    raise exception 'Boriyan kis party ko di/se li — naam likhein';
  end if;
  if kk_strict() and new.charge_to_party and new.rate <= 0 then raise exception 'Charge ke liye fi bori rate likhein'; end if;
  return new;
end; $$;

create or replace function post_bags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.charge_to_party and new.party_name <> '' and new.qty * new.rate > 0 then
    perform ledger_upsert('bags', new.id, new.date, new.party_type, new.party_name,
      case when new.movement = 'Issued' then 'Bardana diya — ' else 'Bardana wapas — ' end
        || new.qty || ' ' || new.bag_type || ' bori x Rs ' || kk_num(new.rate),
      case when new.movement = 'Issued' then new.qty * new.rate else 0 end,
      case when new.movement = 'Returned' then new.qty * new.rate else 0 end);
  else
    perform ledger_remove('bags', new.id);
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------------
-- Auto-khata posting (AFTER triggers)
-- Balance convention everywhere: balance = credit - debit
--   positive = Mill ne party ko dena hai (payable)
--   negative = Party ne mill ko dena hai (receivable)
-- ---------------------------------------------------------------------------

create or replace function post_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_type text; v_name text; v_desc text;
begin
  if new.khata_of = 'Arhti' and new.arhti_name <> '' then
    v_type := 'Arhti'; v_name := new.arhti_name;
  else
    v_type := 'Kisan'; v_name := new.farmer_name;
  end if;
  v_desc := 'Paddy Kharid ' || new.slip_no || ' — ' || new.variety || ', ' || kk_num(new.net_wt) || ' kg @ Rs '
            || kk_num(new.rate_per_maund) || '/maund'
            || case when v_type = 'Arhti' and new.farmer_name <> '' then ' (Kisan: ' || new.farmer_name || ')'
                    when v_type = 'Kisan' and new.mode = 'Arhti' and new.arhti_name <> '' then ' (Arhti: ' || new.arhti_name || ')'
                    else '' end
            || case when new.advance_applied > 0 then ' — mauqa par adaigi Rs ' || kk_num(new.advance_applied) else '' end;
  perform ledger_upsert('purchase', new.id, new.date, v_type, v_name, v_desc, new.advance_applied, new.total_payable);
  return null;
end; $$;

create or replace function post_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ledger_upsert('sale', new.id, new.date, 'Customer', new.customer,
    'Sale Bill ' || new.invoice_no || ' — ' || new.item
      || case when new.variety <> '' then ' (' || new.variety || ')' else '' end
      || ', ' || kk_num(new.qty_kg) || ' kg'
      || case when new.received_now > 0 then ' — mauqa par wasooli Rs ' || kk_num(new.received_now) else '' end,
    new.net_amount, new.received_now);
  return null;
end; $$;

create or replace function post_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bounced boolean := (new.method = 'Cheque' and new.status = 'Bounced');
begin
  perform ledger_upsert('payment', new.id, new.date, new.party_type, new.party_name,
    case when new.direction = 'Paid' then 'Adaigi (Paid)' else 'Wasooli (Received)' end
      || ' — ' || new.method
      || case when new.cheque_no <> '' then ' #' || new.cheque_no else '' end
      || case when new.bank_name <> '' then ' (' || new.bank_name || ')' else '' end
      || case when v_bounced then ' — CHEQUE BOUNCED (raqam khata se hata di gayi)' else '' end
      || case when new.notes <> '' then ' — ' || new.notes else '' end,
    case when not v_bounced and new.direction = 'Paid' then new.amount else 0 end,
    case when not v_bounced and new.direction = 'Received' then new.amount else 0 end);
  return null;
end; $$;

create or replace function post_labor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ledger_upsert('labor', new.id, new.date, 'Labor', new.name,
    'Mazdoori — ' || new.pay_type || ': ' || kk_num(new.units_or_days)
      || case new.pay_type when 'Piece' then ' bags' when 'Monthly' then ' month' else ' din' end
      || ' x Rs ' || kk_num(new.rate_or_wage),
    0, new.gross);
  if new.paid then
    perform ledger_upsert('labor_pay', new.id, coalesce(new.paid_date, new.date), 'Labor', new.name,
      'Mazdoori adaigi (' || new.paid_via || ')'
        || case when new.advance_deducted > 0 then ' — advance kata Rs ' || kk_num(new.advance_deducted) else '' end,
      new.net_pay, 0);
  else
    perform ledger_remove('labor_pay', new.id);
  end if;
  return null;
end; $$;

create or replace function post_expense() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paid_via = 'Udhaar' and new.party_name <> '' then
    perform ledger_upsert('expense', new.id, new.date, 'Supplier', new.party_name,
      'Udhaar kharcha — ' || new.category || case when new.description <> '' then ': ' || new.description else '' end,
      0, new.amount);
  else
    perform ledger_remove('expense', new.id);
  end if;
  return null;
end; $$;

create or replace function post_machinery() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paid_via = 'Udhaar' and new.party_name <> '' and new.cost > 0 then
    perform ledger_upsert('machinery', new.id, new.date, 'Supplier', new.party_name,
      'Udhaar machine repair — ' || new.machine
        || case when new.issue_description <> '' then ': ' || new.issue_description else '' end,
      0, new.cost);
  else
    perform ledger_remove('machinery', new.id);
  end if;
  return null;
end; $$;

create or replace function post_transport() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  v_type := case new.entry_type when 'Arhti Commission' then 'Arhti'
                                when 'Broker Commission' then 'Broker'
                                else 'Transporter' end;
  if new.paid_via = 'Udhaar' and new.party_name <> '' and new.total_amount > 0 then
    perform ledger_upsert('transport', new.id, new.date, v_type, new.party_name,
      'Udhaar — ' || new.entry_type
        || case when new.vehicle_no <> '' then ' (' || new.vehicle_no || ')' else '' end
        || case when new.from_location <> '' or new.to_location <> ''
                then ' ' || new.from_location || ' → ' || new.to_location else '' end,
      0, new.total_amount);
  else
    perform ledger_remove('transport', new.id);
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------------
-- Activity log (who / what / when) — written by the database itself
-- ---------------------------------------------------------------------------

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('kk.restoring', true) = 'on' then return null; end if;
  insert into activity_log (user_id, table_name, action, record_id, details, old_details)
  values (auth.uid(), tg_table_name, tg_op, coalesce(new.id::text, old.id::text), to_jsonb(coalesce(new, old)),
          case when tg_op = 'UPDATE' then to_jsonb(old) end);
  return null;
end; $$;

-- ---------------------------------------------------------------------------
-- Attach triggers
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select * from (values
    ('purchases', 'purchases_before', 'trg_purchases_before'),
    ('sales', 'sales_before', 'trg_sales_before'),
    ('payments', 'payments_before', 'trg_payments_before'),
    ('production_batches', 'production_before', 'trg_production_before'),
    ('stock_lots', 'stock_lots_before', 'trg_stock_lots_before'),
    ('stock_adjustments', 'stock_adjustments_before', 'trg_stock_adjustments_before'),
    ('labor_entries', 'labor_before', 'trg_labor_before'),
    ('transport_entries', 'transport_before', 'trg_transport_before'),
    ('machinery_log', 'machinery_before', 'trg_machinery_before'),
    ('expenses', 'expenses_before', 'trg_expenses_before'),
    ('tax_records', 'tax_before', 'trg_tax_before'),
    ('zakat_assessments', 'zakat_before', 'trg_zakat_before'),
    ('cash_entries', 'cash_entries_before', 'trg_cash_entries_before'),
    ('contracts', 'contracts_before', 'trg_contracts_before'),
    ('weighments', 'weighments_before', 'trg_weighments_before'),
    ('drying_batches', 'drying_before', 'trg_drying_before'),
    ('bag_movements', 'bags_before', 'trg_bags_before')
  ) v(tbl, fn, trg)
  loop
    execute format('drop trigger if exists %I on %I', r.trg, r.tbl);
    execute format('create trigger %I before insert or update on %I for each row execute function %I()', r.trg, r.tbl, r.fn);
  end loop;
end $$;

-- v4 trigger names for the ledger auto-posting are reused on purpose
drop trigger if exists trg_purchase_ledger on purchases;
create trigger trg_purchase_ledger after insert or update on purchases
for each row execute function post_purchase();
drop trigger if exists trg_sale_ledger on sales;
create trigger trg_sale_ledger after insert or update on sales
for each row execute function post_sale();
drop trigger if exists trg_payment_ledger on payments;
create trigger trg_payment_ledger after insert or update on payments
for each row execute function post_payment();
drop trigger if exists trg_labor_ledger on labor_entries;
create trigger trg_labor_ledger after insert or update on labor_entries
for each row execute function post_labor();
drop trigger if exists trg_expense_ledger on expenses;
create trigger trg_expense_ledger after insert or update on expenses
for each row execute function post_expense();
drop trigger if exists trg_machinery_ledger on machinery_log;
create trigger trg_machinery_ledger after insert or update on machinery_log
for each row execute function post_machinery();
drop trigger if exists trg_transport_ledger on transport_entries;
create trigger trg_transport_ledger after insert or update on transport_entries
for each row execute function post_transport();

drop trigger if exists trg_purchase_ledger_cleanup on purchases;
create trigger trg_purchase_ledger_cleanup after delete on purchases
for each row execute function ledger_cleanup('purchase');
drop trigger if exists trg_sale_ledger_cleanup on sales;
create trigger trg_sale_ledger_cleanup after delete on sales
for each row execute function ledger_cleanup('sale');
drop trigger if exists trg_payment_ledger_cleanup on payments;
create trigger trg_payment_ledger_cleanup after delete on payments
for each row execute function ledger_cleanup('payment');
drop trigger if exists trg_labor_ledger_cleanup on labor_entries;
create trigger trg_labor_ledger_cleanup after delete on labor_entries
for each row execute function ledger_cleanup('labor', 'labor_pay');
drop trigger if exists trg_expense_ledger_cleanup on expenses;
create trigger trg_expense_ledger_cleanup after delete on expenses
for each row execute function ledger_cleanup('expense');
drop trigger if exists trg_machinery_ledger_cleanup on machinery_log;
create trigger trg_machinery_ledger_cleanup after delete on machinery_log
for each row execute function ledger_cleanup('machinery');
drop trigger if exists trg_bags_ledger on bag_movements;
create trigger trg_bags_ledger after insert or update on bag_movements
for each row execute function post_bags();
drop trigger if exists trg_bags_ledger_cleanup on bag_movements;
create trigger trg_bags_ledger_cleanup after delete on bag_movements
for each row execute function ledger_cleanup('bags');
drop trigger if exists trg_transport_ledger_cleanup on transport_entries;
create trigger trg_transport_ledger_cleanup after delete on transport_entries
for each row execute function ledger_cleanup('transport');

do $$
declare t text;
begin
  foreach t in array array['purchases','ledger_entries','production_batches','stock_lots','sales','payments',
                           'labor_entries','transport_entries','machinery_log','expenses','tax_records',
                           'zakat_assessments','parties','stock_adjustments','cash_entries','settings','products','varieties',
                           'contracts','weighments','drying_batches','bag_movements']
  loop
    execute format('drop trigger if exists %I on %I', 'trg_log_' || t, t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function log_activity()',
                   'trg_log_' || t, t);
  end loop;
end $$;


-- Period lock on every dated register (see kk_check_lock)
do $$
declare r record;
begin
  for r in select * from (values
    ('purchases', array['date']), ('sales', array['date']), ('payments', array['date', 'status']),
    ('ledger_entries', array['date']), ('production_batches', array['date']), ('stock_adjustments', array['date']),
    ('labor_entries', array['date', 'paid', 'paid_date', 'paid_via']), ('transport_entries', array['date']),
    ('machinery_log', array['date']), ('expenses', array['date']), ('cash_entries', array['date']),
    ('tax_records', array['date', 'status']), ('zakat_assessments', array['assessment_date', 'paid_amount', 'paid_date']),
    ('weighments', array['date', 'second_wt', 'second_at', 'net_wt', 'status']),
    ('drying_batches', array['date']), ('bag_movements', array['date'])
  ) v(tbl, args)
  loop
    execute format('drop trigger if exists %I on %I', 'trg_lock_' || r.tbl, r.tbl);
    execute format('create trigger %I before insert or update or delete on %I for each row execute function kk_check_lock(%s)',
                   'trg_lock_' || r.tbl, r.tbl, (select string_agg(quote_literal(a), ', ') from unnest(r.args) a));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reports / aggregates (SECURITY INVOKER: normal row-level security applies)
-- ---------------------------------------------------------------------------

create or replace function get_party_balances(p_as_of date default null)
returns table (party_type text, party_name text, total_debit numeric, total_credit numeric,
               balance numeric, last_date date, entry_count bigint)
language sql stable set search_path = public as $$
  select l.party_type, min(l.party_name), coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
         coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0), max(l.date), count(*)
  from ledger_entries l
  where p_as_of is null or l.date <= p_as_of
  group by l.party_type, lower(l.party_name);
$$;

create or replace function get_party_statement(p_party_type text, p_party_name text,
                                               p_from date default null, p_to date default null)
returns table (id uuid, date date, description text, debit numeric, credit numeric, balance numeric,
               source text, source_id uuid, created_at timestamptz)
language sql stable set search_path = public as $$
  with base as (
    select l.* from ledger_entries l
    where l.party_type = p_party_type and lower(l.party_name) = lower(trim(p_party_name))
  ), ob as (
    select coalesce(sum(b.credit - b.debit), 0) as v from base b where p_from is not null and b.date < p_from
  ), rng as (
    select b.* from base b
    where (p_from is null or b.date >= p_from) and (p_to is null or b.date <= p_to)
  )
  select * from (
    select null::uuid as id, p_from as date, 'Opening Balance (pichla baqaya)'::text as description,
           0::numeric as debit, 0::numeric as credit, (select v from ob) as balance,
           'brought_forward'::text as source, null::uuid as source_id, null::timestamptz as created_at
    where p_from is not null
    union all
    select r.id, r.date, r.description, r.debit, r.credit,
           (select v from ob) + sum(r.credit - r.debit) over (order by r.date, r.created_at, r.id
                                                              rows between unbounded preceding and current row),
           r.source, r.source_id, r.created_at
    from rng r
  ) s
  order by s.date nulls first, s.created_at nulls first, s.id nulls first;
$$;

drop function if exists get_stock_summary(date);
create or replace function get_stock_summary(p_as_of date default null)
returns table (item text, variety text, category text, qty_in numeric, qty_out numeric, balance_kg numeric, sort_order int)
language sql stable set search_path = public as $$
  with mv as (
    select 'Paddy'::text as item, coalesce(p.variety, '') as variety, p.net_wt as qin, 0::numeric as qout, p.date
      from purchases p
    union all select 'Paddy', coalesce(b.variety, ''), 0, b.paddy_input_kg, b.date from production_batches b
    union all select 'Paddy', coalesce(d.variety, ''), 0, d.loss_kg, d.date from drying_batches d
    union all select o->>'product', coalesce(b.variety, ''), coalesce(nullif(trim(o->>'qty_kg'), '')::numeric, 0), 0, b.date
      from production_batches b cross join lateral jsonb_array_elements(coalesce(b.outputs, '[]'::jsonb)) o
    union all select s.item, coalesce(s.variety, ''), 0, s.qty_kg, s.date from sales s
    union all select a.item, coalesce(a.variety, ''),
                     case when a.direction = 'In' then a.qty_kg else 0 end,
                     case when a.direction = 'Out' then a.qty_kg else 0 end, a.date
      from stock_adjustments a
  ), norm as (
    select coalesce(pr.name, m.item) as item,
           case when coalesce(pr.has_variety, m.item not in ('Bran/Chokar', 'Husk/Tuti')) then m.variety else '' end as variety,
           coalesce(pr.category, case when m.item = 'Paddy' then 'paddy' else 'other' end) as category,
           coalesce(pr.sort_order, 999) as sort_order,
           m.qin, m.qout
    from mv m
    left join products pr on lower(pr.name) = lower(m.item)
    where p_as_of is null or m.date <= p_as_of
  )
  select n.item, n.variety, min(n.category), sum(n.qin), sum(n.qout), sum(n.qin) - sum(n.qout), min(n.sort_order)
  from norm n
  group by n.item, n.variety
  having sum(n.qin) <> 0 or sum(n.qout) <> 0
  order by min(n.sort_order), n.item, n.variety;
$$;

-- Every rupee that moved through Cash or Bank (Rokar / Day Book source).
create or replace function cash_movements()
returns table (date date, account text, direction text, amount numeric, source text, ref_id uuid,
               party text, description text, created_at timestamptz)
language sql stable set search_path = public as $$
  select case when p.method = 'Cheque' then coalesce(p.due_date, p.date) else p.date end,
         case when p.method = 'Cash' then 'Cash' else 'Bank' end,
         case when p.direction = 'Received' then 'In' else 'Out' end,
         p.amount, 'payment', p.id, p.party_name,
         case when p.direction = 'Received' then 'Wasooli' else 'Adaigi' end || ' — ' || p.party_type || ' (' || p.method
           || case when p.cheque_no <> '' then ' #' || p.cheque_no else '' end || ')',
         p.created_at
    from payments p
   where p.method <> 'Cheque' or p.status = 'Cleared'
  union all
  select pu.date, 'Cash', 'Out', pu.advance_applied, 'purchase', pu.id,
         case when pu.khata_of = 'Arhti' and pu.arhti_name <> '' then pu.arhti_name else pu.farmer_name end,
         'Paddy kharid par mauqa adaigi (' || pu.slip_no || ')', pu.created_at
    from purchases pu where pu.advance_applied > 0
  union all
  select s.date, 'Cash', 'In', s.received_now, 'sale', s.id, s.customer,
         'Sale par mauqa wasooli (' || s.invoice_no || ')', s.created_at
    from sales s where s.received_now > 0
  union all
  select e.date, e.paid_via, 'Out', e.amount, 'expense', e.id, e.party_name,
         'Kharcha — ' || e.category || case when e.description <> '' then ': ' || e.description else '' end, e.created_at
    from expenses e where e.paid_via in ('Cash','Bank')
  union all
  select m.date, m.paid_via, 'Out', m.cost, 'machinery', m.id, m.party_name,
         'Machine — ' || m.machine || case when m.issue_description <> '' then ': ' || m.issue_description else '' end,
         m.created_at
    from machinery_log m where m.paid_via in ('Cash','Bank') and m.cost > 0
  union all
  select t.date, t.paid_via, 'Out', t.total_amount, 'transport', t.id, t.party_name,
         t.entry_type || case when t.vehicle_no <> '' then ' (' || t.vehicle_no || ')' else '' end, t.created_at
    from transport_entries t where t.paid_via in ('Cash','Bank') and t.total_amount > 0
  union all
  select coalesce(l.paid_date, l.date), l.paid_via, 'Out', l.net_pay, 'labor', l.id, l.name,
         'Mazdoori adaigi', l.created_at
    from labor_entries l where l.paid and l.net_pay > 0
  union all
  select z.paid_date, 'Cash', 'Out', z.paid_amount, 'zakat', z.id, '', 'Zakat adaigi', z.created_at
    from zakat_assessments z where z.paid_amount > 0 and z.paid_date is not null
  union all
  select w.date, 'Cash', 'In', w.fee, 'weighment', w.id, w.party_name,
         'Kanta fee — ' || w.vehicle_no || ' (' || w.slip_no || ')', w.created_at
    from weighments w where w.fee > 0
  union all
  select c.date, c.account, c.direction, c.amount, 'cash', c.id, '',
         c.category || case when c.description <> '' then ' — ' || c.description else '' end, c.created_at
    from cash_entries c
  union all
  select c.date, case when c.category = 'Cash to Bank' then 'Bank' else 'Cash' end, 'In', c.amount, 'cash', c.id, '',
         c.category || ' (transfer)' || case when c.description <> '' then ' — ' || c.description else '' end, c.created_at
    from cash_entries c where c.category in ('Cash to Bank', 'Bank to Cash');
$$;

create or replace function get_cash_book(p_from date, p_to date)
returns table (date date, account text, direction text, amount numeric, source text, ref_id uuid,
               party text, description text, created_at timestamptz)
language sql stable set search_path = public as $$
  select * from cash_movements() m
  where m.date between p_from and p_to
  order by m.date, m.created_at, m.direction;
$$;

create or replace function get_cash_balances(p_before date default null)
returns table (account text, balance numeric)
language sql stable set search_path = public as $$
  select a.account,
         coalesce(sum(case when m.direction = 'In' then m.amount else -m.amount end), 0)
  from (values ('Cash'), ('Bank')) a(account)
  left join cash_movements() m on m.account = a.account and (p_before is null or m.date < p_before)
  group by a.account
  order by a.account;
$$;

create or replace function get_dashboard_stats(p_today date, p_season_start date default null)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'today_purchase_count', (select count(*) from purchases where date = p_today),
    'today_purchase_kg', (select coalesce(sum(net_wt), 0) from purchases where date = p_today),
    'today_purchase_amount', (select coalesce(sum(total_payable), 0) from purchases where date = p_today),
    'today_sale_count', (select count(*) from sales where date = p_today),
    'today_sale_amount', (select coalesce(sum(net_amount), 0) from sales where date = p_today),
    'today_milled_kg', (select coalesce(sum(paddy_input_kg), 0) from production_batches where date = p_today),
    'season_purchase_count', (select count(*) from purchases where p_season_start is null or date >= p_season_start),
    'season_paddy_kg', (select coalesce(sum(net_wt), 0) from purchases where p_season_start is null or date >= p_season_start),
    'season_purchase_amount', (select coalesce(sum(total_payable), 0) from purchases where p_season_start is null or date >= p_season_start),
    'season_milled_kg', (select coalesce(sum(paddy_input_kg), 0) from production_batches where p_season_start is null or date >= p_season_start),
    'season_rice_kg', (select coalesce(sum(nullif(trim(o->>'qty_kg'), '')::numeric), 0)
                       from production_batches b cross join lateral jsonb_array_elements(b.outputs) o
                       join products pr on lower(pr.name) = lower(o->>'product') and pr.category in ('rice', 'broken')
                       where p_season_start is null or b.date >= p_season_start),
    'season_fullgrain_kg', (select coalesce(sum(nullif(trim(o->>'qty_kg'), '')::numeric), 0)
                       from production_batches b cross join lateral jsonb_array_elements(b.outputs) o
                       join products pr on lower(pr.name) = lower(o->>'product') and pr.category = 'rice'
                       where p_season_start is null or b.date >= p_season_start),
    'season_sale_amount', (select coalesce(sum(net_amount), 0) from sales where p_season_start is null or date >= p_season_start),
    'unpaid_wages', (select coalesce(sum(net_pay), 0) from labor_entries where not paid),
    'unpaid_wage_count', (select count(*) from labor_entries where not paid)
  );
$$;


-- Sauda progress: how much has been delivered / received against each contract
create or replace function get_contract_progress()
returns table (contract_id uuid, delivered_kg numeric, delivered_amount numeric, deliveries bigint, last_date date)
language sql stable set search_path = public as $$
  select x.contract_id, sum(x.kg), sum(x.amt), count(*), max(x.date)
  from (
    select s.contract_id, s.qty_kg as kg, s.net_amount as amt, s.date from sales s where s.contract_id is not null
    union all
    select p.contract_id, p.net_wt, p.total_payable, p.date from purchases p where p.contract_id is not null
  ) x
  group by x.contract_id;
$$;

-- Udhaar ki umar (receivables / payables ageing, FIFO): the outstanding
-- balance is made of the most recent unpaid entries.
create or replace function get_aging(p_as_of date default null)
returns table (party_type text, party_name text, side text, balance numeric, d0_30 numeric, d31_60 numeric,
               d61_90 numeric, d90_plus numeric, oldest date)
language sql stable set search_path = public as $$
  with prm as (select coalesce(p_as_of, pk_today()) as asof),
  l as (select le.*, lower(le.party_name) as k from ledger_entries le, prm where le.date <= prm.asof),
  bal as (
    select l.party_type, l.k, min(l.party_name) as party_name, sum(l.credit) - sum(l.debit) as balance
    from l group by l.party_type, l.k
    having abs(sum(l.credit) - sum(l.debit)) >= 0.01
  ),
  lines as (
    select l.party_type, l.k, l.date, l.debit as amt,
           sum(l.debit) over (partition by l.party_type, l.k order by l.date desc, l.created_at desc, l.id desc) as run
    from l join bal b on b.party_type = l.party_type and b.k = l.k and b.balance < 0
    where l.debit > 0
    union all
    select l.party_type, l.k, l.date, l.credit,
           sum(l.credit) over (partition by l.party_type, l.k order by l.date desc, l.created_at desc, l.id desc)
    from l join bal b on b.party_type = l.party_type and b.k = l.k and b.balance > 0
    where l.credit > 0
  ),
  parts as (
    select x.party_type, x.k, x.date, least(x.amt, abs(b.balance) - (x.run - x.amt)) as part
    from lines x join bal b on b.party_type = x.party_type and b.k = x.k
    where x.run - x.amt < abs(b.balance)
  )
  select b.party_type, b.party_name,
         case when b.balance < 0 then 'receivable' else 'payable' end,
         round(abs(b.balance), 2),
         round(coalesce(sum(p.part) filter (where (select asof from prm) - p.date <= 30), 0), 2),
         round(coalesce(sum(p.part) filter (where (select asof from prm) - p.date between 31 and 60), 0), 2),
         round(coalesce(sum(p.part) filter (where (select asof from prm) - p.date between 61 and 90), 0), 2),
         round(coalesce(sum(p.part) filter (where (select asof from prm) - p.date > 90), 0), 2),
         min(p.date)
  from bal b left join parts p on p.party_type = b.party_type and p.k = b.k
  group by b.party_type, b.party_name, b.balance
  order by abs(b.balance) desc;
$$;

-- Stats / Analytics: everything the charts need in one call
create or replace function get_analytics(p_from date default null, p_to date default null, p_bucket text default 'auto')
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_to date := coalesce(p_to, pk_today());
  v_from date;
  v_b text;
  v jsonb;
begin
  v_from := coalesce(p_from, least(
    coalesce((select min(date) from purchases), v_to), coalesce((select min(date) from sales), v_to),
    coalesce((select min(date) from production_batches), v_to), coalesce((select min(date) from expenses), v_to)));
  if v_to < v_from then v_to := v_from; end if;
  v_b := case when p_bucket in ('day', 'week', 'month') then p_bucket
              when v_to - v_from <= 45 then 'day'
              when v_to - v_from <= 210 then 'week'
              else 'month' end;

  with bk as (
    select g::date as b
    from generate_series(date_trunc(v_b, v_from::timestamp), date_trunc(v_b, v_to::timestamp), ('1 ' || v_b)::interval) g
  ),
  pur as (
    select date_trunc(v_b, date::timestamp)::date as b, sum(net_wt) as kg, sum(amount) as value,
           sum(total_payable) as payable, count(*) as n
    from purchases where date between v_from and v_to group by 1
  ),
  sal as (
    select date_trunc(v_b, date::timestamp)::date as b, sum(qty_kg) as kg, sum(amount) as value,
           sum(net_amount) as billed, count(*) as n
    from sales where date between v_from and v_to group by 1
  ),
  prodx as (
    select b0.date, b0.paddy_input_kg as inp, coalesce(nullif(b0.variety, ''), '—') as variety, b0.process,
      coalesce((select sum(nullif(trim(o->>'qty_kg'), '')::numeric) from jsonb_array_elements(b0.outputs) o
                join products pr on lower(pr.name) = lower(o->>'product') and pr.category in ('rice', 'broken')), 0) as rice,
      coalesce((select sum(nullif(trim(o->>'qty_kg'), '')::numeric) from jsonb_array_elements(b0.outputs) o
                join products pr on lower(pr.name) = lower(o->>'product') and pr.category = 'rice'), 0) as full_rice
    from production_batches b0 where b0.date between v_from and v_to
  ),
  prod as (
    select date_trunc(v_b, date::timestamp)::date as b, sum(inp) as inp, sum(rice) as rice, sum(full_rice) as full_rice
    from prodx group by 1
  ),
  ex as (
    select date_trunc(v_b, d::timestamp)::date as b, sum(a) as amt from (
      select date as d, amount as a from expenses where date between v_from and v_to
      union all select date, cost from machinery_log where date between v_from and v_to
      union all select date, total_amount from transport_entries where date between v_from and v_to
      union all select date, gross from labor_entries where date between v_from and v_to
    ) e group by 1
  ),
  cash as (
    select date_trunc(v_b, m.date::timestamp)::date as b,
           sum(case when m.direction = 'In' then m.amount else 0 end) as cin,
           sum(case when m.direction = 'Out' then m.amount else 0 end) as cout
    from cash_movements() m
    where m.date between v_from and v_to
      and not (m.source = 'cash' and (m.description like 'Cash to Bank%' or m.description like 'Bank to Cash%'
                                      or m.description like 'Opening Balance%'))
    group by 1
  )
  select jsonb_build_object(
    'bucket', v_b, 'from', v_from, 'to', v_to,
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'b', bk.b,
        'purchase_kg', coalesce(pur.kg, 0), 'purchase_value', coalesce(pur.value, 0), 'purchase_payable', coalesce(pur.payable, 0),
        'sale_kg', coalesce(sal.kg, 0), 'sale_value', coalesce(sal.value, 0),
        'milled_kg', coalesce(prod.inp, 0), 'rice_kg', coalesce(prod.rice, 0), 'full_rice_kg', coalesce(prod.full_rice, 0),
        'expenses', coalesce(ex.amt, 0), 'cash_in', coalesce(cash.cin, 0), 'cash_out', coalesce(cash.cout, 0)
      ) order by bk.b), '[]'::jsonb)
      from bk left join pur on pur.b = bk.b left join sal on sal.b = bk.b left join prod on prod.b = bk.b
              left join ex on ex.b = bk.b left join cash on cash.b = bk.b),
    'rates', (select coalesce(jsonb_agg(jsonb_build_object('variety', t.variety, 'points', (
        select coalesce(jsonb_agg(jsonb_build_object('b', r.b, 'rate', r.rate) order by r.b), '[]'::jsonb)
        from (select date_trunc(v_b, p.date::timestamp)::date as b,
                     round(sum(p.amount) / nullif(sum(p.net_wt) / 40.0, 0), 2) as rate
              from purchases p where p.variety = t.variety and p.date between v_from and v_to group by 1) r
      )) order by t.kg desc), '[]'::jsonb)
      from (select variety, sum(net_wt) as kg from purchases where date between v_from and v_to
            group by variety order by sum(net_wt) desc limit 5) t),
    'variety_mix', (select coalesce(jsonb_agg(jsonb_build_object('name', x.variety, 'kg', x.kg, 'value', x.value, 'rate', x.rate)
                                              order by x.kg desc), '[]'::jsonb)
      from (select variety, sum(net_wt) as kg, sum(amount) as value,
                   round(sum(amount) / nullif(sum(net_wt) / 40.0, 0), 2) as rate
            from purchases where date between v_from and v_to group by variety) x),
    'top_suppliers', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'type', x.t, 'value', x.value, 'kg', x.kg)
                                                order by x.value desc), '[]'::jsonb)
      from (select case when khata_of = 'Arhti' and arhti_name <> '' then arhti_name else farmer_name end as name,
                   case when khata_of = 'Arhti' and arhti_name <> '' then 'Arhti' else 'Kisan' end as t,
                   sum(total_payable) as value, sum(net_wt) as kg
            from purchases where date between v_from and v_to
            group by 1, 2 order by sum(total_payable) desc limit 10) x),
    'top_customers', (select coalesce(jsonb_agg(jsonb_build_object('name', x.customer, 'value', x.value, 'kg', x.kg)
                                                order by x.value desc), '[]'::jsonb)
      from (select customer, sum(net_amount) as value, sum(qty_kg) as kg from sales
            where date between v_from and v_to group by customer order by sum(net_amount) desc limit 10) x),
    'sales_by_item', (select coalesce(jsonb_agg(jsonb_build_object('name', x.item, 'kg', x.kg, 'value', x.value, 'per_kg', x.per_kg)
                                                order by x.value desc), '[]'::jsonb)
      from (select item, sum(qty_kg) as kg, sum(amount) as value, round(sum(amount) / nullif(sum(qty_kg), 0), 2) as per_kg
            from sales where date between v_from and v_to group by item) x),
    'expenses_by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'value', x.amt) order by x.amt desc), '[]'::jsonb)
      from (select category as name, sum(amount) as amt from expenses where date between v_from and v_to group by category
            union all select 'Mazdoori (labor)', sum(gross) from labor_entries where date between v_from and v_to having sum(gross) > 0
            union all select 'Machine repair', sum(cost) from machinery_log where date between v_from and v_to having sum(cost) > 0
            union all select 'Transport / commission', sum(total_amount) from transport_entries
              where date between v_from and v_to having sum(total_amount) > 0) x),
    'recovery_by_variety', (select coalesce(jsonb_agg(jsonb_build_object('name', x.variety, 'input', x.inp, 'rice', x.rice,
                                     'full_rice', x.full_rice, 'pct', x.pct) order by x.inp desc), '[]'::jsonb)
      from (select variety, sum(inp) as inp, sum(rice) as rice, sum(full_rice) as full_rice,
                   round(sum(rice) / nullif(sum(inp), 0) * 100, 2) as pct
            from prodx group by variety) x),
    'kpi', jsonb_build_object(
      'purchase_kg', (select coalesce(sum(kg), 0) from pur), 'purchase_value', (select coalesce(sum(value), 0) from pur),
      'purchase_payable', (select coalesce(sum(payable), 0) from pur), 'purchase_count', (select coalesce(sum(n), 0) from pur),
      'sale_kg', (select coalesce(sum(kg), 0) from sal), 'sale_value', (select coalesce(sum(value), 0) from sal),
      'sale_billed', (select coalesce(sum(billed), 0) from sal), 'sale_count', (select coalesce(sum(n), 0) from sal),
      'milled_kg', (select coalesce(sum(inp), 0) from prodx), 'rice_kg', (select coalesce(sum(rice), 0) from prodx),
      'full_rice_kg', (select coalesce(sum(full_rice), 0) from prodx), 'expenses', (select coalesce(sum(amt), 0) from ex),
      'cash_in', (select coalesce(sum(cin), 0) from cash), 'cash_out', (select coalesce(sum(cout), 0) from cash))
  ) into v;
  return v;
end; $$;


-- Bardana balances: bags still with each party, and the mill's own bag stock
create or replace function get_bag_balances()
returns table (holder text, party_type text, party_name text, bag_type text, qty int, issued int, returned int, last_date date)
language sql stable set search_path = public as $$
  select 'party', b.party_type, min(b.party_name), b.bag_type,
         (sum(case when b.movement = 'Issued' then b.qty else 0 end) - sum(case when b.movement = 'Returned' then b.qty else 0 end))::int,
         sum(case when b.movement = 'Issued' then b.qty else 0 end)::int,
         sum(case when b.movement = 'Returned' then b.qty else 0 end)::int,
         max(b.date)
  from bag_movements b
  where b.movement in ('Issued', 'Returned')
  group by b.party_type, lower(b.party_name), b.bag_type
  union all
  select 'mill', '', 'Mill (godown)', m.bag_type,
         sum(case m.movement when 'Purchased' then m.qty when 'Returned' then m.qty when 'Issued' then -m.qty when 'Used' then -m.qty else 0 end)::int,
         sum(case when m.movement = 'Issued' then m.qty else 0 end)::int,
         sum(case when m.movement = 'Returned' then m.qty else 0 end)::int,
         max(m.date)
  from bag_movements m
  group by m.bag_type
  order by 1 desc, 5 desc;
$$;

-- Laagat (costing): what did one maund of rice cost, and what did it sell for?
create or replace function get_costing(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_to date := coalesce(p_to, pk_today());
  v_from date;
  v jsonb;
begin
  v_from := coalesce(p_from, (select min(date) from production_batches), v_to);
  with
  pall as (select sum(total_payable) / nullif(sum(net_wt), 0) as per_kg from purchases where date <= v_to),
  pcost as (select variety, sum(total_payable) / nullif(sum(net_wt), 0) as per_kg from purchases where date <= v_to group by variety),
  milled as (
    select coalesce(nullif(b.variety, ''), '—') as variety, sum(b.paddy_input_kg) as kg
    from production_batches b where b.date between v_from and v_to group by 1
  ),
  dried as (
    select coalesce(nullif(d.variety, ''), '—') as variety, sum(d.loss_kg) as kg
    from drying_batches d where d.date between v_from and v_to group by 1
  ),
  paddy as (
    select coalesce(m.variety, d.variety) as variety, coalesce(m.kg, 0) as milled_kg, coalesce(d.kg, 0) as drying_kg,
           coalesce(pc.per_kg, (select per_kg from pall), 0) as per_kg
    from milled m full join dried d on d.variety = m.variety
    left join pcost pc on pc.variety = coalesce(m.variety, d.variety)
  ),
  outs as (
    select coalesce(pr.name, o->>'product') as product, coalesce(pr.category, 'other') as category,
           sum(nullif(trim(o->>'qty_kg'), '')::numeric) as kg
    from production_batches b cross join lateral jsonb_array_elements(b.outputs) o
    left join products pr on lower(pr.name) = lower(o->>'product')
    where b.date between v_from and v_to
    group by 1, 2
  ),
  sprice as (select lower(item) as k, sum(amount) / nullif(sum(qty_kg), 0) as per_kg from sales where date <= v_to group by lower(item)),
  byp as (
    select o.product, o.kg, coalesce(sp.per_kg, 0) as per_kg, o.kg * coalesce(sp.per_kg, 0) as value
    from outs o left join sprice sp on sp.k = lower(o.product)
    where o.category in ('byproduct', 'other')
  ),
  costs as (
    select 'Mazdoori (labor)' as name, coalesce(sum(gross), 0) as amt from labor_entries where date between v_from and v_to
    union all select 'Kharche: ' || category, sum(amount) from expenses where date between v_from and v_to group by category
    union all select 'Machine repair', coalesce(sum(cost), 0) from machinery_log where date between v_from and v_to
    union all select 'Transport / commission', coalesce(sum(total_amount), 0) from transport_entries where date between v_from and v_to
  ),
  rice_sales as (
    select sum(s.amount) as value, sum(s.qty_kg) as kg
    from sales s join products pr on lower(pr.name) = lower(s.item) and pr.category in ('rice', 'broken')
    where s.date between v_from and v_to
  ),
  tot as (
    select
      (select coalesce(sum(milled_kg * per_kg), 0) from paddy) as paddy_cost,
      (select coalesce(sum(drying_kg * per_kg), 0) from paddy) as drying_cost,
      (select coalesce(sum(amt), 0) from costs) as processing,
      (select coalesce(sum(value), 0) from byp) as byproduct_value,
      (select coalesce(sum(kg), 0) from outs where category in ('rice', 'broken')) as rice_kg,
      (select coalesce(sum(kg), 0) from outs where category = 'rice') as full_rice_kg,
      (select coalesce(sum(milled_kg), 0) from paddy) as milled_kg,
      (select coalesce(sum(drying_kg), 0) from paddy) as drying_kg
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'paddy', (select coalesce(jsonb_agg(jsonb_build_object('variety', variety, 'milled_kg', milled_kg, 'drying_kg', drying_kg,
                'per_kg', round(per_kg, 4), 'cost', round((milled_kg + drying_kg) * per_kg, 2)) order by milled_kg desc), '[]'::jsonb) from paddy),
    'costs', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', round(amt, 2)) order by amt desc), '[]'::jsonb) from costs where amt <> 0),
    'byproducts', (select coalesce(jsonb_agg(jsonb_build_object('product', product, 'kg', kg, 'per_kg', round(per_kg, 4), 'value', round(value, 2)) order by value desc), '[]'::jsonb) from byp),
    'outputs', (select coalesce(jsonb_agg(jsonb_build_object('product', product, 'category', category, 'kg', kg) order by kg desc), '[]'::jsonb) from outs),
    'paddy_cost', round(tot.paddy_cost, 2), 'drying_cost', round(tot.drying_cost, 2), 'processing', round(tot.processing, 2),
    'byproduct_value', round(tot.byproduct_value, 2),
    'net_cost', round(tot.paddy_cost + tot.drying_cost + tot.processing - tot.byproduct_value, 2),
    'milled_kg', tot.milled_kg, 'drying_kg', tot.drying_kg, 'rice_kg', tot.rice_kg, 'full_rice_kg', tot.full_rice_kg,
    'cost_per_kg', case when tot.rice_kg > 0 then round((tot.paddy_cost + tot.drying_cost + tot.processing - tot.byproduct_value) / tot.rice_kg, 4) end,
    'sale_per_kg', (select case when kg > 0 then round(value / kg, 4) end from rice_sales),
    'sale_kg', (select coalesce(kg, 0) from rice_sales)
  ) into v
  from tot;
  return v;
end; $$;

-- ---------------------------------------------------------------------------
-- Owner-only: reset / new season, and restore from a backup
-- ---------------------------------------------------------------------------

drop function if exists owner_reset_all_data();
-- v4 posting functions, replaced by post_purchase / post_sale / post_payment
drop function if exists ledger_from_purchase();
drop function if exists ledger_from_sale();
drop function if exists ledger_from_payment();

create or replace function owner_reset_all_data(p_mode text default 'everything') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := pk_today();
  v_bal jsonb; v_stock jsonb; v_cash jsonb; v_contracts jsonb; v_bags jsonb;
begin
  if not is_owner() then raise exception 'Sirf Owner data reset kar sakta hai'; end if;
  if p_mode is null or p_mode not in ('everything', 'keep_parties', 'carry_forward') then
    raise exception 'Invalid reset mode';
  end if;

  if p_mode = 'carry_forward' then
    select coalesce(jsonb_agg(jsonb_build_object('t', x.party_type, 'n', x.party_name, 'b', x.bal)), '[]'::jsonb) into v_bal
    from (select party_type, min(party_name) as party_name, round(sum(credit) - sum(debit), 2) as bal
          from ledger_entries group by party_type, lower(party_name)) x
    where x.bal <> 0;
    select coalesce(jsonb_agg(jsonb_build_object('i', s.item, 'v', s.variety, 'q', round(s.balance_kg, 2))), '[]'::jsonb) into v_stock
    from get_stock_summary(null) s where round(s.balance_kg, 2) <> 0;
    select coalesce(jsonb_agg(jsonb_build_object('a', c.account, 'b', round(c.balance, 2))), '[]'::jsonb) into v_cash
    from get_cash_balances(null) c where round(c.balance, 2) <> 0;
    select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('pending', round(c.qty_kg - coalesce(g.delivered_kg, 0), 2))), '[]'::jsonb)
      into v_contracts
    from contracts c left join get_contract_progress() g on g.contract_id = c.id
    where c.status = 'Open' and c.qty_kg - coalesce(g.delivered_kg, 0) > 0.01;
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into v_bags from get_bag_balances() b where b.qty <> 0;
  end if;

  truncate table purchases, ledger_entries, production_batches, stock_lots, stock_adjustments, sales, payments,
                 labor_entries, transport_entries, machinery_log, expenses, tax_records, zakat_assessments,
                 cash_entries, contracts, weighments, drying_batches, bag_movements, activity_log restart identity;
  delete from doc_counters where true;

  perform set_config('kk.restoring', 'on', true);
  if p_mode = 'everything' then
    truncate table parties;
  elsif p_mode = 'keep_parties' then
    update parties set opening_balance = 0 where true;
  else
    update parties set opening_balance = 0, opening_date = v_today where true;
    insert into parties (party_type, name, opening_balance, opening_date)
    select x->>'t', x->>'n', (x->>'b')::numeric, v_today from jsonb_array_elements(v_bal) x
    on conflict (party_type, (lower(name))) do update
      set opening_balance = excluded.opening_balance, opening_date = excluded.opening_date;
    insert into stock_adjustments (date, item, variety, direction, qty_kg, reason, notes)
    select v_today, x->>'i', x->>'v', case when (x->>'q')::numeric >= 0 then 'In' else 'Out' end,
           abs((x->>'q')::numeric), 'Opening Stock', 'Pichle season se carry forward'
    from jsonb_array_elements(v_stock) x;
    insert into cash_entries (date, account, direction, category, amount, description)
    select v_today, x->>'a', case when (x->>'b')::numeric >= 0 then 'In' else 'Out' end, 'Opening Balance',
           abs((x->>'b')::numeric), 'Pichle season se carry forward'
    from jsonb_array_elements(v_cash) x;
    insert into contracts (contract_no, date, kind, party_type, party_name, item, variety, qty_kg, rate, rate_unit,
                           currency, fx_rate, delivery_from, delivery_to, payment_terms, status, notes)
    select x->>'contract_no', (x->>'date')::date, x->>'kind', x->>'party_type', x->>'party_name', x->>'item', x->>'variety',
           (x->>'pending')::numeric, (x->>'rate')::numeric, x->>'rate_unit', x->>'currency', (x->>'fx_rate')::numeric,
           nullif(x->>'delivery_from', '')::date, nullif(x->>'delivery_to', '')::date, x->>'payment_terms', 'Open',
           trim(coalesce(x->>'notes', '') || ' (pichle season ka baqi sauda)')
    from jsonb_array_elements(coalesce(v_contracts, '[]'::jsonb)) x;
    perform set_doc_no('sale_contract', (select max(nullif(substring(contract_no from '(\d+)$'), '')::bigint) from contracts where kind = 'sale'));
    perform set_doc_no('purchase_contract', (select max(nullif(substring(contract_no from '(\d+)$'), '')::bigint) from contracts where kind = 'purchase'));
    -- bags still with each party (or owed back by the mill)
    insert into bag_movements (date, movement, party_type, party_name, bag_type, qty, notes)
    select v_today, case when (x->>'qty')::int > 0 then 'Issued' else 'Returned' end,
           coalesce(nullif(x->>'party_type', ''), 'Arhti'), coalesce(x->>'party_name', ''), x->>'bag_type',
           abs((x->>'qty')::int), 'Pichle season se carry forward'
    from jsonb_array_elements(coalesce(v_bags, '[]'::jsonb)) x
    where x->>'holder' = 'party' and (x->>'qty')::int <> 0;
    -- mill's own bag stock: opening so that (purchased - issued + returned) = old stock
    insert into bag_movements (date, movement, bag_type, qty, notes)
    select v_today, case when t.q >= 0 then 'Purchased' else 'Used' end, t.bag_type, abs(t.q), 'Pichle season se carry forward'
    from (select x->>'bag_type' as bag_type, sum((x->>'qty')::int) as q
          from jsonb_array_elements(coalesce(v_bags, '[]'::jsonb)) x group by 1) t
    where t.q <> 0;
  end if;
  perform set_config('kk.restoring', 'off', true);

  insert into activity_log (user_id, table_name, action, record_id, details)
  values (auth.uid(), 'system', 'RESET', null,
          jsonb_build_object('message', 'Data reset by Owner', 'mode', p_mode));
end; $$;

create or replace function owner_restore_backup(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text;
  n int;
  counts jsonb := '{}'::jsonb;
  -- parent tables first; ledger last (only manual entries — the rest are rebuilt by triggers)
  tables text[] := array['products','varieties','contracts','weighments','parties','purchases','sales','payments','production_batches','stock_lots',
                         'stock_adjustments','labor_entries','transport_entries','machinery_log','expenses',
                         'tax_records','zakat_assessments','cash_entries','drying_batches','bag_movements'];
begin
  if not is_owner() then raise exception 'Sirf Owner backup restore kar sakta hai'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or not (p_data ? 'purchases' or p_data ? 'ledger_entries') then
    raise exception 'Yeh Jatala Rice Mills app ki backup file nahi lagti';
  end if;

  perform set_config('kk.restoring', 'on', true);

  truncate table purchases, ledger_entries, production_batches, stock_lots, stock_adjustments, sales, payments,
                 labor_entries, transport_entries, machinery_log, expenses, tax_records, zakat_assessments,
                 cash_entries, contracts, weighments, drying_batches, bag_movements, parties restart identity;

  if jsonb_typeof(p_data->'settings') = 'array' and jsonb_array_length(p_data->'settings') > 0 then
    update settings s set
      mill_name = coalesce(x.mill_name, s.mill_name), address = coalesce(x.address, s.address),
      phone = coalesce(x.phone, s.phone), ntn = coalesce(x.ntn, s.ntn), strn = coalesce(x.strn, s.strn),
      season_start = x.season_start, fumigation_days = coalesce(x.fumigation_days, s.fumigation_days),
      ageing_days = coalesce(x.ageing_days, s.ageing_days), invoice_prefix = coalesce(x.invoice_prefix, s.invoice_prefix),
      slip_prefix = coalesce(x.slip_prefix, s.slip_prefix), invoice_footer = coalesce(x.invoice_footer, s.invoice_footer)
    from jsonb_populate_record(null::settings, p_data->'settings'->0) x
    where s.id = 1;
  end if;

  foreach t in array tables loop
    if t in ('products', 'varieties') and (jsonb_typeof(p_data->t) <> 'array' or jsonb_array_length(p_data->t) = 0) then
      continue; -- old backup without a products list: keep the current one
    end if;
    if t in ('products', 'varieties') then
      execute format('truncate table %I', t);
    end if;
    if jsonb_typeof(p_data->t) = 'array' then
      execute format(
        'insert into %1$I select r.* from jsonb_array_elements($1) e,
           lateral jsonb_populate_record(null::%1$I,
             case when (e->>''created_by'') is not null
                   and not exists (select 1 from auth.users u where u.id::text = e->>''created_by'')
                  then e - ''created_by'' else e end) r', t)
      using p_data->t;
      get diagnostics n = row_count;
      counts := counts || jsonb_build_object(t, n);
    end if;
  end loop;

  if jsonb_typeof(p_data->'ledger_entries') = 'array' then
    insert into ledger_entries
    select r.* from jsonb_array_elements(p_data->'ledger_entries') e,
      lateral jsonb_populate_record(null::ledger_entries,
        case when (e->>'created_by') is not null
              and not exists (select 1 from auth.users u where u.id::text = e->>'created_by')
             then e - 'created_by' else e end) r
    where coalesce(e->>'source', 'manual') = 'manual';
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object('ledger_entries_manual', n);
  end if;

  perform set_doc_no('sale_invoice', (select max(nullif(substring(invoice_no from '(\d+)$'), '')::bigint) from sales));
  perform set_doc_no('purchase_slip', (select max(nullif(substring(slip_no from '(\d+)$'), '')::bigint) from purchases));
  perform set_doc_no('sale_contract', (select max(nullif(substring(contract_no from '(\d+)$'), '')::bigint) from contracts where kind = 'sale'));
  perform set_doc_no('purchase_contract', (select max(nullif(substring(contract_no from '(\d+)$'), '')::bigint) from contracts where kind = 'purchase'));
  perform set_doc_no('weighment', (select max(nullif(substring(slip_no from '(\d+)$'), '')::bigint) from weighments));

  perform set_config('kk.restoring', 'off', true);
  insert into activity_log (user_id, table_name, action, record_id, details)
  values (auth.uid(), 'system', 'RESTORE', null, jsonb_build_object('message', 'Backup restored by Owner', 'counts', counts));
  return counts;
end; $$;


-- Owner: delete chosen registers between two dates (khata entries follow
-- automatically; locked periods are refused by the period lock).
create or replace function owner_delete_data(p_tables text[], p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text;
  col text;
  n int;
  res jsonb := '{}'::jsonb;
  allowed jsonb := '{"purchases":"date","sales":"date","payments":"date","ledger_entries":"date","production_batches":"date",
                     "stock_adjustments":"date","stock_lots":"date_in","labor_entries":"date","transport_entries":"date",
                     "machinery_log":"date","expenses":"date","cash_entries":"date","tax_records":"date",
                     "zakat_assessments":"assessment_date","contracts":"date","weighments":"date","drying_batches":"date",
                     "bag_movements":"date"}'::jsonb;
begin
  if not is_owner() then raise exception 'Sirf Owner data delete kar sakta hai'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Sahi muddat (se / tak) chunein'; end if;
  if p_tables is null or cardinality(p_tables) = 0 then raise exception 'Kam az kam ek register chunein'; end if;
  if exists (select 1 from settings where id = 1 and lock_date is not null and p_from <= lock_date) then
    raise exception 'Hisaab % tak band (lock) hai — chuni hui muddat lock se takrati hai. Pehle lock ki tareekh peeche karein.',
      (select to_char(lock_date, 'DD-MM-YYYY') from settings where id = 1);
  end if;
  foreach t in array p_tables loop
    col := allowed ->> t;
    if col is null then raise exception 'Yeh register delete nahi ho sakta: %', t; end if;
    if t = 'ledger_entries' then
      -- only manual khata entries; auto ones go with their source records
      execute format('delete from %I where %I between $1 and $2 and source = %L', t, col, 'manual') using p_from, p_to;
    else
      execute format('delete from %I where %I between $1 and $2', t, col) using p_from, p_to;
    end if;
    get diagnostics n = row_count;
    res := res || jsonb_build_object(t, n);
  end loop;
  insert into activity_log (user_id, table_name, action, record_id, details)
  values (auth.uid(), 'system', 'DELETE_RANGE', null,
          jsonb_build_object('message', 'Owner ne muddat ka data delete kiya', 'from', p_from, 'to', p_to, 'counts', res));
  return res;
end; $$;

-- ---------------------------------------------------------------------------
-- Row-level security. Read: any approved staff member. Write: per-module
-- permission (role default, overridable per user by the Owner).
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table activity_log enable row level security;
alter table settings enable row level security;

do $$
declare t text; pol record;
begin
  foreach t in array array['profiles','activity_log','settings','purchases','ledger_entries','production_batches',
                           'stock_lots','sales','payments','labor_entries','transport_entries','machinery_log',
                           'expenses','tax_records','zakat_assessments','parties','stock_adjustments','cash_entries',
                           'products','varieties','contracts','weighments','drying_batches','bag_movements']
  loop
    execute format('alter table %I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy "profiles_read" on profiles for select
  using (auth.uid() = id or (select is_admin()));
create policy "profiles_update_own_name" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "activity_read_admin" on activity_log for select using ((select is_admin()));

create policy "settings_read" on settings for select using ((select is_approved()));
create policy "settings_update" on settings for update using ((select is_owner())) with check ((select is_owner()));

do $$
declare r record;
begin
  for r in select * from (values
    ('purchases','purchase'), ('ledger_entries','ledger'), ('production_batches','production'),
    ('stock_lots','stock'), ('stock_adjustments','stock'), ('sales','sales'), ('payments','payments'),
    ('labor_entries','labor'), ('transport_entries','transport'), ('machinery_log','machinery'),
    ('expenses','expenses'), ('tax_records','tax'), ('zakat_assessments','zakat'),
    ('parties','parties'), ('cash_entries','cashbook'), ('products','products'), ('varieties','products'),
    ('weighments','weighbridge'), ('drying_batches','production'), ('bag_movements','stock')
  ) v(tbl, module)
  loop
    execute format('create policy %I on %I for select using ((select can_do(%L, %L)))', r.tbl || '_read', r.tbl, r.module, 'view');
    execute format('create policy %I on %I for insert with check ((select can_do(%L, %L)))', r.tbl || '_insert', r.tbl, r.module, 'add');
    execute format('create policy %I on %I for update using ((select can_do(%L, %L))) with check ((select can_do(%L, %L)))',
                   r.tbl || '_update', r.tbl, r.module, 'edit', r.module, 'edit');
    execute format('create policy %I on %I for delete using ((select can_do(%L, %L)))', r.tbl || '_delete', r.tbl, r.module, 'delete');
  end loop;
end $$;

-- Sauda: sale contracts follow the Sales permission, purchase contracts the Purchase one
create policy "contracts_read" on contracts for select
  using ((kind = 'sale' and (select can_do('sales', 'view'))) or (kind = 'purchase' and (select can_do('purchase', 'view'))));
create policy "contracts_insert" on contracts for insert
  with check ((kind = 'sale' and (select can_do('sales', 'add'))) or (kind = 'purchase' and (select can_do('purchase', 'add'))));
create policy "contracts_update" on contracts for update
  using ((kind = 'sale' and (select can_do('sales', 'edit'))) or (kind = 'purchase' and (select can_do('purchase', 'edit'))))
  with check ((kind = 'sale' and (select can_do('sales', 'edit'))) or (kind = 'purchase' and (select can_do('purchase', 'edit'))));
create policy "contracts_delete" on contracts for delete
  using ((kind = 'sale' and (select can_do('sales', 'delete'))) or (kind = 'purchase' and (select can_do('purchase', 'delete'))));

-- Column-level lock-down of profiles (defence in depth with profiles_guard)
revoke insert, update, delete on profiles from anon, authenticated;
grant select on profiles to authenticated;
grant update (full_name) on profiles to authenticated;

-- activity_log / settings are never written directly by the app
revoke insert, update, delete on activity_log from anon, authenticated;
revoke insert, delete on settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function grants. Internal helpers are not callable through the API;
-- owner-only functions are not callable by anonymous visitors at all.
-- ---------------------------------------------------------------------------

revoke execute on function ledger_upsert(text, uuid, date, text, text, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function ledger_remove(text, uuid) from public, anon, authenticated;
revoke execute on function cascade_party_name(text, text, text) from public, anon, authenticated;
revoke execute on function cascade_variety_name(text, text) from public, anon, authenticated;
revoke execute on function cascade_product_name(text, text) from public, anon, authenticated;
revoke execute on function merge_product(uuid, uuid) from public, anon;
revoke execute on function merge_variety(uuid, uuid) from public, anon;
grant execute on function merge_product(uuid, uuid) to authenticated;
grant execute on function merge_variety(uuid, uuid) to authenticated;
revoke execute on function product_in_use(text) from public, anon;
revoke execute on function variety_in_use(text) from public, anon;
revoke execute on function cash_movements() from public, anon;

revoke execute on function admin_update_profile(uuid, text, user_role, text) from public, anon;
revoke execute on function admin_set_permissions(uuid, jsonb) from public, anon;
revoke execute on function owner_reset_all_data(text) from public, anon;
revoke execute on function owner_restore_backup(jsonb) from public, anon;
revoke execute on function merge_party(uuid, uuid) from public, anon;
revoke execute on function owner_delete_data(text[], date, date) from public, anon;
grant execute on function owner_delete_data(text[], date, date) to authenticated;
grant execute on function admin_update_profile(uuid, text, user_role, text) to authenticated;
grant execute on function admin_set_permissions(uuid, jsonb) to authenticated;
grant execute on function owner_reset_all_data(text) to authenticated;
grant execute on function owner_restore_backup(jsonb) to authenticated;
grant execute on function merge_party(uuid, uuid) to authenticated;

revoke execute on function get_party_balances(date) from public, anon;
revoke execute on function get_party_statement(text, text, date, date) from public, anon;
revoke execute on function get_stock_summary(date) from public, anon;
revoke execute on function get_cash_book(date, date) from public, anon;
revoke execute on function get_cash_balances(date) from public, anon;
revoke execute on function get_dashboard_stats(date, date) from public, anon;
revoke execute on function get_contract_progress() from public, anon;
revoke execute on function get_aging(date) from public, anon;
revoke execute on function get_analytics(date, date, text) from public, anon;
grant execute on function get_contract_progress() to authenticated;
grant execute on function get_aging(date) to authenticated;
grant execute on function get_analytics(date, date, text) to authenticated;
revoke execute on function get_bag_balances() from public, anon;
revoke execute on function get_costing(date, date) from public, anon;
grant execute on function get_bag_balances() to authenticated;
grant execute on function get_costing(date, date) to authenticated;
grant execute on function cash_movements() to authenticated;
grant execute on function get_party_balances(date) to authenticated;
grant execute on function get_party_statement(text, text, date, date) to authenticated;
grant execute on function get_stock_summary(date) to authenticated;
grant execute on function get_cash_book(date, date) to authenticated;
grant execute on function get_cash_balances(date) to authenticated;
grant execute on function get_dashboard_stats(date, date) to authenticated;

grant execute on function owner_exists() to anon, authenticated;

revoke execute on function next_doc_no(text) from public, anon, authenticated;
revoke execute on function set_doc_no(text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists ledger_entries_party_type_party_name_idx on ledger_entries (party_type, party_name);
create index if not exists ledger_entries_party_lower_idx on ledger_entries (party_type, lower(party_name));
create index if not exists ledger_entries_date_idx on ledger_entries (date);
create index if not exists purchases_date_idx on purchases (date);
create index if not exists sales_date_idx on sales (date);
create index if not exists payments_date_idx on payments (date);
create index if not exists payments_status_due_date_idx on payments (status, due_date);
create index if not exists production_batches_date_idx on production_batches (date);
create index if not exists stock_lots_godown_idx on stock_lots (godown);
create index if not exists stock_adjustments_date_idx on stock_adjustments (date);
create index if not exists labor_entries_date_idx on labor_entries (date);
create index if not exists transport_entries_date_idx on transport_entries (date);
create index if not exists machinery_log_date_idx on machinery_log (date);
create index if not exists expenses_date_idx on expenses (date);
create index if not exists tax_records_date_idx on tax_records (date);
create index if not exists cash_entries_date_idx on cash_entries (date);
create index if not exists activity_log_created_at_idx on activity_log (created_at desc);
create index if not exists activity_log_table_name_idx on activity_log (table_name);
create index if not exists sales_contract_idx on sales (contract_id) where contract_id is not null;
create index if not exists purchases_contract_idx on purchases (contract_id) where contract_id is not null;
create index if not exists contracts_kind_status_idx on contracts (kind, status);
create index if not exists weighments_status_date_idx on weighments (status, date);
create index if not exists drying_batches_date_idx on drying_batches (date);
create index if not exists bag_movements_party_idx on bag_movements (party_type, lower(party_name));

-- ---------------------------------------------------------------------------
-- Realtime: every module table pushes live changes to all open screens
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['purchases','ledger_entries','production_batches','stock_lots','sales','payments',
                           'labor_entries','transport_entries','machinery_log','expenses','tax_records',
                           'zakat_assessments','activity_log','profiles','parties','stock_adjustments',
                           'cash_entries','settings','products','varieties','contracts','weighments','drying_batches','bag_movements']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Default products & varieties (only when the lists are empty — the Owner can
-- rename / add / switch off any of them later)
-- ---------------------------------------------------------------------------
do $seed$
begin
  perform set_config('kk.restoring', 'on', true);
  insert into products (name, category, has_variety, sale_unit, sort_order)
  select * from (values
    ('Paddy', 'paddy', true, 'maund', 1),
    ('Rice - Full Grain', 'rice', true, 'maund', 10),
    ('Sella Rice', 'rice', true, 'maund', 11),
    ('Steam Rice', 'rice', true, 'maund', 12),
    ('Kanki 25%', 'broken', true, 'maund', 20),
    ('Kanki 50%', 'broken', true, 'maund', 21),
    ('Kanki 100%', 'broken', true, 'maund', 22),
    ('Bran/Chokar', 'byproduct', false, 'kg', 30),
    ('Husk/Tuti', 'byproduct', false, 'kg', 31),
    ('Other', 'other', true, 'kg', 99)
  ) v(name, category, has_variety, sale_unit, sort_order)
  where not exists (select 1 from products);

  insert into varieties (name, sort_order)
  select * from (values
    ('Super Basmati', 10), ('Basmati 1121', 20), ('Basmati 1509', 30), ('Basmati 515', 40),
    ('Basmati 386 (PK-386)', 50), ('Kainat', 60), ('Super Kernel', 70), ('Irri-6', 80), ('Irri-9', 90),
    ('KS-282', 100), ('Other', 999)
  ) v(name, sort_order)
  where not exists (select 1 from varieties);
  perform set_config('kk.restoring', 'off', true);
end
$seed$;
-- ============================================================================
-- PART 3 — ONE-TIME DATA UPGRADE (existing v4 data -> v5 rules)
-- Runs quietly: no activity-log spam, old rows are not re-validated.
-- ============================================================================

do $backfill$
begin
  perform set_config('kk.restoring', 'on', true);
  perform set_config('kk.ledger_internal', 'on', true);

  -- 1) Parties list from the existing khata (most common spelling wins), so
  --    every re-posted entry below snaps to one spelling per party.
  insert into parties (party_type, name, opening_date)
  select coalesce(nullif(trim(party_type), ''), 'Other'),
         mode() within group (order by regexp_replace(trim(party_name), '\s+', ' ', 'g')),
         min(date)
  from ledger_entries
  where trim(coalesce(party_name, '')) <> ''
  group by coalesce(nullif(trim(party_type), ''), 'Other'), kk_norm(party_name)
  on conflict (party_type, (lower(name))) do nothing;

  -- 2) Purchases: slip numbers (in date order) + keep the v4 khata rule
  --    (v4 always posted purchases to the Kisan). Re-saving also fills the new
  --    computed columns (total_payable etc.) and refreshes the khata text.
  with numbered as (
    select id, row_number() over (order by date, created_at, id) as rn
    from purchases where coalesce(slip_no, '') = ''
  )
  update purchases p
     set slip_no = (select slip_prefix from settings where id = 1) || lpad(n.rn::text, 5, '0'),
         khata_of = 'Kisan'
    from numbered n where p.id = n.id;
  update purchases set khata_of = 'Kisan' where khata_of = '';
  perform set_doc_no('purchase_slip', (select max(nullif(substring(slip_no from '(\d+)$'), '')::bigint) from purchases));

  -- 3) Sales: invoice numbers (in date order)
  with numbered as (
    select id, row_number() over (order by date, created_at, id) as rn
    from sales where coalesce(invoice_no, '') = ''
  )
  update sales s
     set invoice_no = (select invoice_prefix from settings where id = 1) || lpad(n.rn::text, 5, '0')
    from numbered n where s.id = n.id;
  perform set_doc_no('sale_invoice', (select max(nullif(substring(invoice_no from '(\d+)$'), '')::bigint) from sales));

  -- 4) Payments: re-post so BOUNCED cheques stop counting in the khata
  update payments set notes = coalesce(notes, '') where true;

  -- 5) Labor: wages now go into each worker's khata (earned = Jama, paid = Banam)
  update labor_entries set paid_date = case when paid then coalesce(paid_date, date) else null end where true;

  -- 6) Transport: fill the new total (freight + commission)
  update transport_entries set paid_via = coalesce(paid_via, 'Cash') where true;

  -- 7) Manual khata entries: snap names to the single spelling in Parties
  update ledger_entries l
     set party_name = p.name
    from parties p
   where p.party_type = l.party_type
     and lower(p.name) = kk_norm(l.party_name)
     and l.party_name <> p.name;

  -- 8) Products & varieties already used in old entries join the managed lists
  insert into varieties (name, sort_order)
  select min(v), 500 from (
    select trim(variety) v from purchases union all select trim(variety) from production_batches
    union all select trim(variety) from sales union all select trim(variety) from stock_adjustments
    union all select trim(variety) from stock_lots) x
  where coalesce(v, '') <> ''
  group by lower(v)
  on conflict ((lower(name))) do nothing;

  insert into products (name, category, has_variety, sale_unit, sort_order)
  select min(i), case when lower(min(i)) like 'kanki%' or lower(min(i)) like '%broken%' then 'broken' else 'other' end, true, 'kg', 500
  from (select trim(item) i from sales union all select trim(item) from stock_adjustments union all select trim(item) from stock_lots) x
  where coalesce(i, '') <> ''
  group by lower(i)
  on conflict ((lower(name))) do nothing;

  -- 9) Old production batches: fixed output columns -> output lines
  update production_batches set outputs = '[]'::jsonb
   where jsonb_array_length(outputs) = 0
     and (rice_output_kg + coalesce(kanki25, 0) + coalesce(kanki50, 0) + coalesce(kanki100, 0) + coalesce(bran_kg, 0) + coalesce(husk_kg, 0)) > 0;

  -- 10) brand: the untouched default name becomes Jatala Rice Mills
  update settings set mill_name = 'Jatala Rice Mills' where id = 1 and mill_name = 'Rice Mill';

  perform set_config('kk.ledger_internal', 'off', true);
  perform set_config('kk.restoring', 'off', true);
end
$backfill$;

commit;

-- ============================================================================
-- Done. Agla qadam:
-- 1. Authentication -> Sign In / Providers -> Email: "Confirm email" OFF.
-- 2. Owner account banne ke BAAD: Authentication -> "Allow new users to sign up" OFF
--    (staff accounts Owner khud app se banata hai — public signup ki zaroorat nahi).
-- 3. Edge Function "admin-create-user" deploy/update karein (DEPLOYMENT_GUIDE.md).
-- ============================================================================
