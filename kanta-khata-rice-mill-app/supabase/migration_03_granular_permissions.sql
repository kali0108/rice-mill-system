-- ============================================================================
-- Kanta Khata — migration for projects that already ran schema.sql v2
-- (the version with invited_emails / pending-approval / Activity Log).
-- If you're setting up a brand-new Supabase project, ignore this file and
-- just run supabase/schema.sql instead — it already includes everything below.
--
-- Select everything below and Run — no separate steps needed this time
-- (unlike migration_02, this one doesn't touch the enum type).
-- ============================================================================

alter table profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function role_default_permission(r user_role, module text) returns boolean
language sql immutable as $$
  select case
    when r = 'owner' then true
    when module in ('purchase','ledger','payments','tax','zakat') then r = 'munshi'
    when module in ('production','stock','labor','transport','machinery','expenses') then r in ('munshi','godown_incharge')
    when module = 'sales' then r in ('munshi','sales_staff')
    else false
  end;
$$;

create or replace function has_permission(module text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  prof record;
begin
  select role, status, permissions into prof from profiles where id = auth.uid();
  if prof is null or prof.status <> 'active' then return false; end if;
  if prof.role = 'owner' then return true; end if;
  if prof.permissions ? module then
    return (prof.permissions ->> module)::boolean;
  end if;
  return role_default_permission(prof.role, module);
end; $$;

create or replace function admin_set_permissions(target_user uuid, perms jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'Only the Owner can set permissions'; end if;
  if target_user in (select id from profiles where role = 'owner') then
    raise exception 'Owner permissions cannot be restricted';
  end if;
  update profiles set permissions = coalesce(perms, '{}'::jsonb) where id = target_user;
end; $$;

-- Swap every write policy from a fixed role list to has_permission(), so
-- Owner-set overrides actually take effect. Drop the old fixed-role policies
-- by their exact original names, then recreate with has_permission().
drop policy if exists "purchases_update" on purchases;
drop policy if exists "purchases_delete" on purchases;
create policy "purchases_write" on purchases for insert with check (has_permission('purchase'));
create policy "purchases_update" on purchases for update using (has_permission('purchase'));
create policy "purchases_delete" on purchases for delete using (has_permission('purchase'));

drop policy if exists "ledger_write" on ledger_entries;
drop policy if exists "ledger_update" on ledger_entries;
drop policy if exists "ledger_delete" on ledger_entries;
create policy "ledger_write" on ledger_entries for insert with check (has_permission('ledger'));
create policy "ledger_update" on ledger_entries for update using (has_permission('ledger'));
create policy "ledger_delete" on ledger_entries for delete using (has_permission('ledger'));

drop policy if exists "production_write" on production_batches;
drop policy if exists "production_update" on production_batches;
drop policy if exists "production_delete" on production_batches;
create policy "production_write" on production_batches for insert with check (has_permission('production'));
create policy "production_update" on production_batches for update using (has_permission('production'));
create policy "production_delete" on production_batches for delete using (has_permission('production'));

drop policy if exists "stock_write" on stock_lots;
drop policy if exists "stock_update" on stock_lots;
drop policy if exists "stock_delete" on stock_lots;
create policy "stock_write" on stock_lots for insert with check (has_permission('stock'));
create policy "stock_update" on stock_lots for update using (has_permission('stock'));
create policy "stock_delete" on stock_lots for delete using (has_permission('stock'));

drop policy if exists "sales_write" on sales;
drop policy if exists "sales_update" on sales;
drop policy if exists "sales_delete" on sales;
create policy "sales_write" on sales for insert with check (has_permission('sales'));
create policy "sales_update" on sales for update using (has_permission('sales'));
create policy "sales_delete" on sales for delete using (has_permission('sales'));

drop policy if exists "payments_write" on payments;
drop policy if exists "payments_update" on payments;
drop policy if exists "payments_delete" on payments;
create policy "payments_write" on payments for insert with check (has_permission('payments'));
create policy "payments_update" on payments for update using (has_permission('payments'));
create policy "payments_delete" on payments for delete using (has_permission('payments'));

drop policy if exists "labor_write" on labor_entries;
drop policy if exists "labor_update" on labor_entries;
drop policy if exists "labor_delete" on labor_entries;
create policy "labor_write" on labor_entries for insert with check (has_permission('labor'));
create policy "labor_update" on labor_entries for update using (has_permission('labor'));
create policy "labor_delete" on labor_entries for delete using (has_permission('labor'));

drop policy if exists "transport_write" on transport_entries;
drop policy if exists "transport_update" on transport_entries;
drop policy if exists "transport_delete" on transport_entries;
create policy "transport_write" on transport_entries for insert with check (has_permission('transport'));
create policy "transport_update" on transport_entries for update using (has_permission('transport'));
create policy "transport_delete" on transport_entries for delete using (has_permission('transport'));

drop policy if exists "machinery_write" on machinery_log;
drop policy if exists "machinery_update" on machinery_log;
drop policy if exists "machinery_delete" on machinery_log;
create policy "machinery_write" on machinery_log for insert with check (has_permission('machinery'));
create policy "machinery_update" on machinery_log for update using (has_permission('machinery'));
create policy "machinery_delete" on machinery_log for delete using (has_permission('machinery'));

drop policy if exists "expenses_write" on expenses;
drop policy if exists "expenses_update" on expenses;
drop policy if exists "expenses_delete" on expenses;
create policy "expenses_write" on expenses for insert with check (has_permission('expenses'));
create policy "expenses_update" on expenses for update using (has_permission('expenses'));
create policy "expenses_delete" on expenses for delete using (has_permission('expenses'));

drop policy if exists "tax_write" on tax_records;
drop policy if exists "tax_update" on tax_records;
drop policy if exists "tax_delete" on tax_records;
create policy "tax_write" on tax_records for insert with check (has_permission('tax'));
create policy "tax_update" on tax_records for update using (has_permission('tax'));
create policy "tax_delete" on tax_records for delete using (has_permission('tax'));

drop policy if exists "zakat_write" on zakat_assessments;
drop policy if exists "zakat_update" on zakat_assessments;
drop policy if exists "zakat_delete" on zakat_assessments;
create policy "zakat_write" on zakat_assessments for insert with check (has_permission('zakat'));
create policy "zakat_update" on zakat_assessments for update using (has_permission('zakat'));
create policy "zakat_delete" on zakat_assessments for delete using (has_permission('zakat'));

-- ============================================================================
-- Done. Now go to Authentication -> Settings and make sure "Confirm email"
-- is OFF (turn it off if you turned it on for the previous version).
-- ============================================================================
