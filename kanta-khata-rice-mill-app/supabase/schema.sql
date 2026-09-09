-- ============================================================================
-- Kanta Khata — Rice Mill Manager — Supabase Schema (v2: user management)
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- This version is for a FRESH project. If you already ran the earlier schema,
-- use supabase/migration_02_user_management.sql instead.
-- ============================================================================

-- ---------- Roles, status & Profiles ----------------------------------------
-- 'pending' = signed up without an invite; has zero permissions until the
-- Owner approves them from the Users & Roles page.
create type user_role as enum ('owner','munshi','godown_incharge','sales_staff','pending');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text default '',
  role user_role not null default 'pending',
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

-- Current caller's role — returns NULL (matches no policy) if the account is
-- suspended, so suspending someone silently revokes every permission at once.
-- security definer so it can read profiles under its own RLS-bypassing
-- privileges, avoiding recursive-policy issues on the profiles table itself.
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active';
$$;

-- Lets the (unauthenticated) login screen show "this will create the Owner
-- account" messaging without exposing any user data.
create or replace function owner_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where role = 'owner');
$$;
grant execute on function owner_exists() to anon, authenticated;

create table invited_emails (
  email text primary key,
  full_name text default '',
  role user_role not null default 'sales_staff',
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  used boolean not null default false
);

-- New Supabase auth user -> auto-create a profile row.
--  1. First person ever to sign up becomes Owner.
--  2. If their email matches a pending invite, they get the invited role
--     immediately (and the invite is marked used).
--  3. Otherwise they land in 'pending' — visible to the Owner, but with no
--     read/write access anywhere until approved.
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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- Owner-only: invite someone by email with a pre-assigned role.
create or replace function invite_user(target_email text, target_full_name text, target_role user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can invite staff'; end if;
  if target_role = 'pending' then raise exception 'Cannot invite someone as pending'; end if;
  insert into invited_emails (email, full_name, role, invited_by)
  values (lower(target_email), target_full_name, target_role, auth.uid())
  on conflict (email) do update set full_name = excluded.full_name, role = excluded.role, used = false, invited_at = now();
end; $$;

-- Owner-only: withdraw an invite that hasn't been used yet.
create or replace function revoke_invite(target_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can revoke invites'; end if;
  delete from invited_emails where email = lower(target_email) and used = false;
end; $$;

-- Owner-only: edit an existing staff member's name / role / active-suspended status.
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

alter table profiles enable row level security;
create policy "profiles_read" on profiles for select using (auth.uid() = id or my_role() = 'owner');
create policy "profiles_update_own_name" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

alter table invited_emails enable row level security;
create policy "invited_owner_all" on invited_emails for all using (my_role() = 'owner') with check (my_role() = 'owner');

-- ---------- Core operational tables ----------------------------------------

create table purchases (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  mode text not null default 'Direct',
  farmer_name text not null,
  arhti_name text default '',
  variety text not null,
  bags int not null default 0,
  gross_wt numeric not null default 0,
  tare_wt numeric not null default 0,
  net_wt numeric not null default 0,
  moisture_pct numeric default 0,
  broken_pct numeric default 0,
  fm_pct numeric default 0,
  rate_per_maund numeric not null default 0,
  amount numeric not null default 0,
  advance_applied numeric not null default 0,
  net_payable numeric not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  party_type text not null,
  party_name text not null,
  description text default '',
  debit numeric not null default 0,
  credit numeric not null default 0,
  source text not null default 'manual',
  source_id uuid,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table production_batches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  lot_no text not null,
  process text not null default 'Raw',
  paddy_input_kg numeric not null default 0,
  rice_output_kg numeric not null default 0,
  kanki25 numeric default 0,
  kanki50 numeric default 0,
  kanki100 numeric default 0,
  bran_kg numeric default 0,
  husk_kg numeric default 0,
  wastage_kg numeric default 0,
  recovery_pct numeric not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table stock_lots (
  id uuid primary key default gen_random_uuid(),
  godown text not null,
  lot_no text not null,
  item text not null,
  bags int not null default 0,
  weight_per_bag_kg numeric not null default 0,
  total_weight_kg numeric not null default 0,
  date_in date not null,
  last_fumigation date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  customer text not null,
  type text not null default 'Local',
  item text not null,
  qty_kg numeric not null default 0,
  rate numeric not null default 0,
  tax_pct numeric default 0,
  amount numeric not null default 0,
  tax_amount numeric not null default 0,
  net_amount numeric not null default 0,
  container_no text default '',
  shipment_date date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  party_type text not null,
  party_name text not null,
  direction text not null,
  method text not null default 'Cash',
  amount numeric not null default 0,
  cheque_no text default '',
  due_date date,
  status text not null default 'Cleared',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table labor_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  pay_type text not null default 'Daily',
  rate_or_wage numeric not null default 0,
  units_or_days numeric not null default 0,
  advance_deducted numeric default 0,
  gross numeric not null default 0,
  net_pay numeric not null default 0,
  paid boolean not null default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table transport_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  entry_type text not null default 'Delivery',
  vehicle_no text default '',
  driver_name text default '',
  from_location text default '',
  to_location text default '',
  item text default '',
  qty_kg numeric default 0,
  freight_rate_per_kg numeric default 0,
  freight_amount numeric not null default 0,
  commission_base_amount numeric default 0,
  commission_pct numeric default 0,
  commission_amount numeric not null default 0,
  notes text default '',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table machinery_log (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  machine text not null default 'Huller',
  issue_description text default '',
  action_taken text default '',
  cost numeric default 0,
  next_service_due date,
  status text not null default 'Operational',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null default 'Other',
  description text default '',
  amount numeric not null default 0,
  paid_via text not null default 'Cash',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table tax_records (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  tax_type text not null default 'Sales Tax/GST',
  reference text default '',
  taxable_amount numeric not null default 0,
  tax_pct numeric not null default 0,
  tax_amount numeric not null default 0,
  status text not null default 'Pending',
  notes text default '',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table zakat_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_date date not null,
  cash_in_hand numeric default 0,
  bank_balance numeric default 0,
  stock_value numeric default 0,
  receivables numeric default 0,
  payables numeric default 0,
  nisab_threshold numeric default 0,
  zakatable_amount numeric not null default 0,
  zakat_due numeric not null default 0,
  paid_amount numeric default 0,
  paid_date date,
  notes text default '',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table activity_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  table_name text,
  action text,
  record_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Auto-cascade: purchases / sales / payments -> ledger_entries ---

create or replace function ledger_from_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (new.date, 'Kisan', new.farmer_name,
          'Paddy Purchase — ' || new.variety || ', ' || round(new.net_wt) || 'kg',
          new.advance_applied, new.amount, 'purchase', new.id);
  return new;
end; $$;
create trigger trg_purchase_ledger after insert on purchases
for each row execute function ledger_from_purchase();

create or replace function ledger_from_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (new.date, 'Customer', new.customer,
          'Sale Invoice — ' || new.item || ', ' || round(new.qty_kg) || 'kg',
          new.net_amount, 0, 'sale', new.id);
  return new;
end; $$;
create trigger trg_sale_ledger after insert on sales
for each row execute function ledger_from_sale();

create or replace function ledger_from_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (new.date, new.party_type, new.party_name,
          'Payment ' || new.direction || ' — ' || new.method || case when new.cheque_no <> '' then ' #' || new.cheque_no else '' end,
          case when new.direction = 'Paid' then new.amount else 0 end,
          case when new.direction = 'Received' then new.amount else 0 end,
          'payment', new.id);
  return new;
end; $$;
create trigger trg_payment_ledger after insert on payments
for each row execute function ledger_from_payment();

create or replace function ledger_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from ledger_entries where source_id = old.id and source = TG_ARGV[0];
  return old;
end; $$;
create trigger trg_purchase_ledger_cleanup after delete on purchases
for each row execute function ledger_cleanup('purchase');
create trigger trg_sale_ledger_cleanup after delete on sales
for each row execute function ledger_cleanup('sale');
create trigger trg_payment_ledger_cleanup after delete on payments
for each row execute function ledger_cleanup('payment');

-- ---------- Activity log trigger (attached to every core table below) ------

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (user_id, table_name, action, record_id, details)
  values (auth.uid(), TG_TABLE_NAME, TG_OP, coalesce(new.id::text, old.id::text), to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end; $$;

do $$
declare t text;
begin
  foreach t in array array['purchases','ledger_entries','production_batches','stock_lots','sales',
                            'payments','labor_entries','transport_entries','machinery_log','expenses',
                            'tax_records','zakat_assessments']
  loop
    execute format('create trigger trg_log_%1$s after insert or update or delete on %1$s for each row execute function log_activity();', t);
  end loop;
end $$;

alter table activity_log enable row level security;
create policy "activity_read_owner" on activity_log for select using (my_role() = 'owner');

-- ---------- RLS: read policies -----------------------------------------
-- Any *approved* staff member (not pending, not suspended) can read every
-- operational table. Pending/suspended accounts get nothing back from these.

do $$
declare t text;
begin
  foreach t in array array['purchases','ledger_entries','production_batches','stock_lots','sales',
                            'payments','labor_entries','transport_entries','machinery_log','expenses',
                            'tax_records','zakat_assessments']
  loop
    execute format('alter table %1$s enable row level security;', t);
    execute format('create policy "%1$s_read" on %1$s for select using (my_role() in (''owner'',''munshi'',''godown_incharge'',''sales_staff''));', t);
  end loop;
end $$;

-- ---------- RLS: write policies per role -----------------------------------

create policy "purchases_write" on purchases for insert with check (my_role() in ('owner','munshi'));
create policy "purchases_update" on purchases for update using (my_role() in ('owner','munshi'));
create policy "purchases_delete" on purchases for delete using (my_role() in ('owner','munshi'));

create policy "ledger_write" on ledger_entries for insert with check (my_role() in ('owner','munshi'));
create policy "ledger_update" on ledger_entries for update using (my_role() in ('owner','munshi'));
create policy "ledger_delete" on ledger_entries for delete using (my_role() in ('owner','munshi'));

create policy "production_write" on production_batches for insert with check (my_role() in ('owner','munshi','godown_incharge'));
create policy "production_update" on production_batches for update using (my_role() in ('owner','munshi','godown_incharge'));
create policy "production_delete" on production_batches for delete using (my_role() in ('owner','munshi','godown_incharge'));

create policy "stock_write" on stock_lots for insert with check (my_role() in ('owner','munshi','godown_incharge'));
create policy "stock_update" on stock_lots for update using (my_role() in ('owner','munshi','godown_incharge'));
create policy "stock_delete" on stock_lots for delete using (my_role() in ('owner','munshi','godown_incharge'));

create policy "sales_write" on sales for insert with check (my_role() in ('owner','munshi','sales_staff'));
create policy "sales_update" on sales for update using (my_role() in ('owner','munshi','sales_staff'));
create policy "sales_delete" on sales for delete using (my_role() in ('owner','munshi','sales_staff'));

create policy "payments_write" on payments for insert with check (my_role() in ('owner','munshi'));
create policy "payments_update" on payments for update using (my_role() in ('owner','munshi'));
create policy "payments_delete" on payments for delete using (my_role() in ('owner','munshi'));

create policy "labor_write" on labor_entries for insert with check (my_role() in ('owner','munshi','godown_incharge'));
create policy "labor_update" on labor_entries for update using (my_role() in ('owner','munshi','godown_incharge'));
create policy "labor_delete" on labor_entries for delete using (my_role() in ('owner','munshi','godown_incharge'));

create policy "transport_write" on transport_entries for insert with check (my_role() in ('owner','munshi','godown_incharge'));
create policy "transport_update" on transport_entries for update using (my_role() in ('owner','munshi','godown_incharge'));
create policy "transport_delete" on transport_entries for delete using (my_role() in ('owner','munshi','godown_incharge'));

create policy "machinery_write" on machinery_log for insert with check (my_role() in ('owner','munshi','godown_incharge'));
create policy "machinery_update" on machinery_log for update using (my_role() in ('owner','munshi','godown_incharge'));
create policy "machinery_delete" on machinery_log for delete using (my_role() in ('owner','munshi','godown_incharge'));

create policy "expenses_write" on expenses for insert with check (my_role() in ('owner','munshi','godown_incharge'));
create policy "expenses_update" on expenses for update using (my_role() in ('owner','munshi','godown_incharge'));
create policy "expenses_delete" on expenses for delete using (my_role() in ('owner','munshi','godown_incharge'));

create policy "tax_write" on tax_records for insert with check (my_role() in ('owner','munshi'));
create policy "tax_update" on tax_records for update using (my_role() in ('owner','munshi'));
create policy "tax_delete" on tax_records for delete using (my_role() in ('owner','munshi'));

create policy "zakat_write" on zakat_assessments for insert with check (my_role() in ('owner','munshi'));
create policy "zakat_update" on zakat_assessments for update using (my_role() in ('owner','munshi'));
create policy "zakat_delete" on zakat_assessments for delete using (my_role() in ('owner','munshi'));

-- ---------- Helpful indexes -------------------------------------------------
create index on ledger_entries (party_type, party_name);
create index on purchases (date);
create index on sales (date);
create index on payments (status, due_date);
create index on stock_lots (godown);
create index on activity_log (created_at desc);
create index on activity_log (table_name);

-- ============================================================================
-- Done. Next: Authentication -> Settings -> turn ON "Confirm email" (this is
-- the confirmation step for every signup, including the very first Owner
-- account). Authentication -> Providers -> Email should already be enabled.
-- ============================================================================
