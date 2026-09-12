-- ============================================================================
-- Kanta Khata — migration for any project on an earlier schema (v2/v3/v4).
-- Needed now that every module supports editing existing entries, not just
-- add/delete: without this, editing a Purchase/Sale/Payment's amount would
-- leave its auto-generated Khata entry showing the old, wrong number.
--
-- If you're setting up a brand-new Supabase project, ignore this file and
-- just run supabase/schema.sql instead — it already includes everything below.
--
-- Select everything below and Run.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ledger_source_unique') then
    alter table ledger_entries add constraint ledger_source_unique unique (source, source_id);
  end if;
end $$;

create or replace function ledger_from_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (new.date, 'Kisan', new.farmer_name,
          'Paddy Purchase — ' || new.variety || ', ' || round(new.net_wt) || 'kg',
          new.advance_applied, new.amount, 'purchase', new.id)
  on conflict (source, source_id) do update set
    date = excluded.date, party_name = excluded.party_name, description = excluded.description,
    debit = excluded.debit, credit = excluded.credit;
  return new;
end; $$;

create or replace function ledger_from_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (new.date, 'Customer', new.customer,
          'Sale Invoice — ' || new.item || ', ' || round(new.qty_kg) || 'kg',
          new.net_amount, 0, 'sale', new.id)
  on conflict (source, source_id) do update set
    date = excluded.date, party_name = excluded.party_name, description = excluded.description,
    debit = excluded.debit, credit = excluded.credit;
  return new;
end; $$;

create or replace function ledger_from_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
  values (new.date, new.party_type, new.party_name,
          'Payment ' || new.direction || ' — ' || new.method || case when new.cheque_no <> '' then ' #' || new.cheque_no else '' end,
          case when new.direction = 'Paid' then new.amount else 0 end,
          case when new.direction = 'Received' then new.amount else 0 end,
          'payment', new.id)
  on conflict (source, source_id) do update set
    date = excluded.date, party_type = excluded.party_type, party_name = excluded.party_name,
    description = excluded.description, debit = excluded.debit, credit = excluded.credit;
  return new;
end; $$;

drop trigger if exists trg_purchase_ledger on purchases;
create trigger trg_purchase_ledger after insert or update on purchases
for each row execute function ledger_from_purchase();

drop trigger if exists trg_sale_ledger on sales;
create trigger trg_sale_ledger after insert or update on sales
for each row execute function ledger_from_sale();

drop trigger if exists trg_payment_ledger on payments;
create trigger trg_payment_ledger after insert or update on payments
for each row execute function ledger_from_payment();

-- ============================================================================
-- Done. No app-side changes needed here — the Edit buttons on every module
-- page already call the same update() path now that this migration covers.
-- ============================================================================
