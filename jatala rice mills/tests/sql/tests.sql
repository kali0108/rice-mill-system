\set ON_ERROR_STOP 1
\pset pager off
set client_min_messages = warning;
-- Behave like the Supabase API: pg-safeupdate blocks UPDATE/DELETE without WHERE.
-- (If the library is not installed on this machine the tests still run.)
\set ON_ERROR_STOP 0
load 'safeupdate';
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- helpers
create schema if not exists test;
grant usage on schema test to public;

create or replace function test.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, false);
end $$;

create or replace function test.eq(actual anyelement, expected anyelement, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ASSERT FAILED: % — expected [%] got [%]', msg, expected, actual;
  end if;
end $$;

create or replace function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

-- run sql, expect an error whose message matches pattern (case-insensitive)
create or replace function test.err(q text, pattern text, msg text) returns void language plpgsql as $$
declare m text;
begin
  begin
    execute q;
  exception when others then
    m := sqlerrm;
    if m !~* pattern then raise exception 'ASSERT FAILED: % — wrong error: %', msg, m; end if;
    return;
  end;
  raise exception 'ASSERT FAILED: % — expected an error, none raised', msg;
end $$;

grant execute on all functions in schema test to public;

-- ids
\set OWNER   '11111111-1111-1111-1111-111111111111'
\set MUNSHI  '22222222-2222-2222-2222-222222222222'
\set GODOWN  '33333333-3333-3333-3333-333333333333'
\set SALES   '44444444-4444-4444-4444-444444444444'
\set RANDOM  '55555555-5555-5555-5555-555555555555'
\set OWNER2  '66666666-6666-6666-6666-666666666666'

-- ---------------------------------------------------------------- 1. signup & roles
insert into auth.users (id, email, raw_user_meta_data) values (:'OWNER', 'owner@mill.pk', '{"full_name":"Haji Owner"}');
insert into auth.users (id, email, raw_user_meta_data) values (:'RANDOM', 'hacker@x.com', '{"full_name":"Hacker"}');
select test.eq((select role::text from profiles where id = :'OWNER'), 'owner', 'first signup is owner');
select test.eq((select role::text from profiles where id = :'RANDOM'), 'pending', 'second signup is pending');

-- edge function (service_role) creating staff
insert into auth.users (id, email, raw_user_meta_data) values
  (:'MUNSHI', 'munshi@mill.pk', '{"full_name":"Munshi Sahib"}'),
  (:'GODOWN', 'godown@mill.pk', '{"full_name":"Godown Wala"}'),
  (:'SALES',  'sales@mill.pk',  '{"full_name":"Sales Boy"}');
set role service_role;
update profiles set role = 'munshi' where id = :'MUNSHI';
update profiles set role = 'godown_incharge' where id = :'GODOWN';
update profiles set role = 'sales_staff' where id = :'SALES';
reset role;
select test.eq((select count(*)::int from profiles where role <> 'pending'), 4, 'staff created by service role');

-- ---------------------------------------------------------------- 2. SECURITY
-- 2a anonymous visitor cannot wipe data or call admin functions
select test.login(null);
set role anon;
select test.err($$select owner_reset_all_data()$$, 'permission denied', 'anon reset blocked');
select test.err($$select owner_reset_all_data('everything')$$, 'permission denied', 'anon reset(mode) blocked');
select test.err($$select admin_update_profile('55555555-5555-5555-5555-555555555555', 'x', 'owner', 'active')$$, 'permission denied', 'anon admin_update_profile blocked');
select test.err($$select owner_restore_backup('{}'::jsonb)$$, 'permission denied', 'anon restore blocked');
select test.err($$select ledger_upsert('purchase', gen_random_uuid(), current_date, 'Kisan', 'x', 'x', 0, 100)$$, 'permission denied', 'anon ledger_upsert blocked');
select test.eq((select count(*)::int from purchases), 0, 'anon sees no purchases');
select test.err($$select merge_product(gen_random_uuid(), gen_random_uuid())$$, 'permission denied', 'anon merge blocked');
select test.eq(owner_exists(), true, 'anon can call owner_exists');
reset role;

-- 2b pending (self-signed-up) user cannot promote themselves
select test.login(:'RANDOM');
set role authenticated;
select test.err($$update profiles set role = 'owner' where id = auth.uid()$$, 'permission denied|sirf owner', 'pending cannot set own role');
select test.err($$select admin_update_profile(auth.uid(), 'x', 'owner', 'active')$$, 'sirf owner', 'pending cannot call admin_update_profile');
select test.err($$select admin_set_permissions(auth.uid(), '{"purchase":true}')$$, 'sirf owner', 'pending cannot set permissions');
select test.err($$select owner_reset_all_data('everything')$$, 'sirf owner', 'pending cannot reset');
select test.err($$insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values (current_date, 'x', 'y', 100, 10, 1000)$$, 'row-level security', 'pending cannot insert');
update profiles set full_name = 'New Name' where id = auth.uid();
reset role;
select test.eq((select full_name from profiles where id = :'RANDOM'), 'New Name', 'user can rename self');
select test.eq((select role::text from profiles where id = :'RANDOM'), 'pending', 'still pending');

-- 2c suspended account cannot do anything (old bug: NULL role bypassed checks)
select test.login(:'OWNER');
set role authenticated;
select admin_update_profile(:'GODOWN', 'Godown Wala', 'godown_incharge', 'suspended');
reset role;
select test.login(:'GODOWN');
set role authenticated;
select test.err($$select admin_update_profile(auth.uid(), 'x', 'owner', 'active')$$, 'sirf owner', 'suspended cannot unsuspend self');
select test.err($$select owner_reset_all_data('everything')$$, 'sirf owner', 'suspended cannot reset');
select test.eq((select count(*)::int from settings), 0, 'suspended reads nothing');
reset role;
select test.login(:'OWNER');
set role authenticated;
select admin_update_profile(:'GODOWN', 'Godown Wala', 'godown_incharge', 'active');

-- 2d owner cannot lock themselves out; last-owner protection
select test.err($$select admin_update_profile('11111111-1111-1111-1111-111111111111', 'Haji Owner', 'munshi', 'active')$$, 'khud ka role', 'owner cannot demote self');
select test.err($$select admin_update_profile('11111111-1111-1111-1111-111111111111', 'Haji Owner', 'owner', 'suspended')$$, 'khud ka role', 'owner cannot suspend self');
select test.err($$select admin_set_permissions('11111111-1111-1111-1111-111111111111', '{"sales":false}')$$, 'restrict nahi', 'owner perms cannot be restricted');
-- permissions are sanitised to booleans only
select admin_set_permissions(:'SALES', '{"stock": true, "evil": "x", "payments": false}');
reset role;
select test.eq((select permissions from profiles where id = :'SALES'), '{"stock": true, "payments": false}'::jsonb, 'permissions sanitised');
select test.login(:'OWNER');
set role authenticated;
select admin_set_permissions(:'SALES', '{}');
reset role;

-- 2e staff cannot read activity log or profiles of others
select test.login(:'MUNSHI');
set role authenticated;
select test.eq((select count(*)::int from profiles), 1, 'munshi sees only own profile');
select test.eq((select count(*)::int from activity_log), 0, 'munshi cannot read activity log');
select test.err($$select ledger_upsert('purchase', gen_random_uuid(), current_date, 'Kisan', 'x', 'x', 0, 100)$$, 'permission denied', 'munshi cannot call internal ledger_upsert');
select test.err($$insert into activity_log (table_name, action) values ('x','y')$$, 'permission denied', 'cannot forge activity log');
reset role;

-- ---------------------------------------------------------------- 3. Purchases & khata
select test.login(:'MUNSHI');
set role authenticated;
insert into purchases (date, mode, farmer_name, variety, bags, gross_wt, tare_wt, bag_wt_kg, deduction_kg, rate_per_maund, advance_applied)
values ('2026-10-01', 'Direct', '  Allah   Ditta ', 'Super Basmati', 100, 5200, 200, 1, 20, 4000, 50000);
select test.eq((select net_wt from purchases), 4880.00, 'net wt = 5200-200-100*1-20');
select test.eq((select amount from purchases), 488000.00, 'amount = 4880/40*4000');
select test.eq((select total_payable from purchases), 488000.00, 'total payable');
select test.eq((select net_payable from purchases), 438000.00, 'net payable after cash paid');
select test.eq((select farmer_name from purchases), 'Allah Ditta', 'name normalised');
select test.eq((select slip_no from purchases), 'PS-00001', 'slip number auto');
select test.eq((select khata_of from purchases), 'Kisan', 'direct -> kisan khata');
select test.eq((select party_type || '|' || party_name || '|' || debit || '|' || credit from ledger_entries where source = 'purchase'),
               'Kisan|Allah Ditta|50000.00|488000.00', 'purchase posted to kisan khata');
select test.eq((select count(*)::int from parties where party_type = 'Kisan' and name = 'Allah Ditta'), 1, 'party auto-created');

-- Arhti mode: khata goes to the Arhti, with commission and labour deduction
insert into purchases (date, mode, farmer_name, arhti_name, variety, bags, gross_wt, tare_wt, rate_per_maund, commission_pct, labor_charges)
values ('2026-10-02', 'Arhti', 'Kisan Bashir', 'Rana Traders', 'Super Basmati', 50, 2000, 0, 3600, 2, 500);
select test.eq((select amount from purchases where arhti_name = 'Rana Traders'), 180000.00, 'arhti amount');
select test.eq((select commission_amount from purchases where arhti_name = 'Rana Traders'), 3600.00, 'commission 2%');
select test.eq((select total_payable from purchases where arhti_name = 'Rana Traders'), 183100.00, 'total = amount + comm - labour');
select test.eq((select party_type || '|' || party_name || '|' || credit from ledger_entries where source = 'purchase' and party_type = 'Arhti'),
               'Arhti|Rana Traders|183100.00', 'arhti khata credited');
-- Arhti mode but mill settles with the Kisan
insert into purchases (date, mode, farmer_name, arhti_name, khata_of, variety, gross_wt, tare_wt, rate_per_maund)
values ('2026-10-02', 'Arhti', 'Kisan Nazir', 'Rana Traders', 'Kisan', 'Basmati 1121', 1000, 0, 4000);
select test.eq((select count(*)::int from ledger_entries where party_type = 'Kisan' and party_name = 'Kisan Nazir'), 1, 'khata_of=Kisan respected');

-- validation
select test.err($$insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-01', 'X', 'Y', 100, 200, 1000)$$, 'net weight', 'tare > gross rejected');
select test.err($$insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-01', '', 'Y', 300, 200, 1000)$$, 'kisan ka naam', 'kisan name required');
select test.err($$insert into purchases (date, mode, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-01', 'Arhti', 'k', 'Y', 300, 200, 1000)$$, 'arhti ka naam', 'arhti name required');

-- ledger guard: auto entries can't be edited/deleted/forged directly
select test.err($$update ledger_entries set credit = 1 where source = 'purchase'$$, 'khud bani', 'cannot edit auto entry');
select test.err($$delete from ledger_entries where source = 'purchase'$$, 'khud bani', 'cannot delete auto entry');
insert into ledger_entries (date, party_type, party_name, description, debit, credit, source, source_id)
values ('2026-10-03', 'Kisan', 'allah ditta', 'forged?', 1000, 0, 'purchase', gen_random_uuid());
select test.eq((select source || '|' || party_name from ledger_entries where description = 'forged?'), 'manual|Allah Ditta', 'direct insert forced manual + canonical name');
update ledger_entries set debit = 1500 where description = 'forged?';
delete from ledger_entries where description = 'forged?';
select test.err($$insert into ledger_entries (date, party_type, party_name, debit, credit) values ('2026-10-03', 'Kisan', 'X', 0, 0)$$, 'debit ya credit', 'zero manual entry rejected');

-- editing a purchase re-syncs its khata entry
update purchases set rate_per_maund = 4100 where slip_no = 'PS-00001';
select test.eq((select credit from ledger_entries where source = 'purchase' and party_name = 'Allah Ditta'), 500200.00, 'khata follows purchase edit');
reset role;

-- godown incharge cannot write purchases (RLS)
select test.login(:'GODOWN');
set role authenticated;
select test.err($$insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-01', 'X', 'Y', 300, 200, 1000)$$, 'row-level security', 'godown cannot buy');
select test.eq((select count(*)::int from purchases), 3, 'godown can read');
reset role;

-- ---------------------------------------------------------------- 4. Payments, bounced cheques
select test.login(:'MUNSHI');
set role authenticated;
insert into payments (date, party_type, party_name, direction, method, amount) values ('2026-10-05', 'Kisan', 'ALLAH DITTA', 'Paid', 'Cash', 100000);
select test.eq((select party_name from payments where amount = 100000), 'ALLAH DITTA', 'payment keeps typed name');
select test.eq((select party_name from ledger_entries where source = 'payment'), 'Allah Ditta', 'payment khata canonical name');
insert into payments (date, party_type, party_name, direction, method, amount, cheque_no, due_date, bank_name)
values ('2026-10-05', 'Arhti', 'Rana Traders', 'Paid', 'Cheque', 83100, '000123', '2026-10-20', 'HBL');
select test.eq((select status from payments where cheque_no = '000123'), 'Pending', 'cheque pending by default');
select test.eq((select debit from ledger_entries l join payments p on p.id = l.source_id where p.cheque_no = '000123'), 83100.00, 'pending cheque in khata');
update payments set status = 'Bounced' where cheque_no = '000123';
select test.eq((select debit from ledger_entries l join payments p on p.id = l.source_id where p.cheque_no = '000123'), 0.00, 'bounced cheque removed from khata');
update payments set status = 'Cleared' where cheque_no = '000123';
select test.err($$insert into payments (date, party_type, party_name, direction, method, amount) values ('2026-10-05', 'Kisan', 'X', 'Paid', 'Cash', 0)$$, 'zero se zyada', 'zero payment rejected');

-- balances
select test.eq((select balance from get_party_balances() where party_name = 'Allah Ditta'), 350200.00, 'allah ditta: 500200 - 50000 - 100000');
select test.eq((select balance from get_party_balances() where party_name = 'Rana Traders'), 100000.00, 'rana: 183100 - 83100');

-- statement with opening + running balance
select test.eq((select count(*)::int from get_party_statement('Kisan', 'allah ditta', '2026-10-02', null)), 2, 'statement rows (b/f + payment)');
select test.eq((select balance from get_party_statement('Kisan', 'Allah Ditta', '2026-10-02', null) where source = 'brought_forward'), 450200.00, 'brought forward');
select test.eq((select balance from get_party_statement('Kisan', 'Allah Ditta', '2026-10-02', null) where source = 'payment'), 350200.00, 'running balance');
reset role;

-- ---------------------------------------------------------------- 5. Sales & stock
select test.login(:'SALES');
set role authenticated;
select test.err($$insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-01', 'X', 'Y', 300, 200, 1000)$$, 'row-level security', 'sales staff cannot buy');
insert into sales (date, customer, item, variety, qty_kg, rate, rate_unit, tax_pct, received_now)
values ('2026-10-06', 'Lahore Rice Co', 'Rice - Full Grain', 'Super Basmati', 2000, 9000, 'maund', 0, 100000);
select test.eq((select amount from sales), 450000.00, 'maund-rate sale amount');
select test.eq((select invoice_no from sales), 'INV-00001', 'invoice number');
select test.eq((select debit || '|' || credit from ledger_entries where source = 'sale'), '450000.00|100000.00', 'sale khata: debit bill, credit cash received');
insert into sales (date, customer, item, qty_kg, rate, tax_pct) values ('2026-10-06', 'Lahore Rice Co', 'Bran/Chokar', 500, 50, 18);
select test.eq((select net_amount from sales where item = 'Bran/Chokar'), 29500.00, 'per-kg sale with tax');
select test.eq((select invoice_no from sales where item = 'Bran/Chokar'), 'INV-00002', 'invoice number 2');
insert into parties (party_type, name, phone) values ('Customer', 'Karachi Exporters', '03001234567');
select test.err($$insert into parties (party_type, name) values ('Customer', 'karachi  exporters')$$, 'duplicate|unique', 'duplicate party rejected');
reset role;

select test.login(:'GODOWN');
set role authenticated;
insert into production_batches (date, lot_no, process, variety, paddy_input_kg, rice_output_kg, kanki25, kanki50, kanki100, bran_kg, husk_kg, wastage_kg)
values ('2026-10-04', 'LOT-1', 'Raw', 'Super Basmati', 4000, 2200, 200, 100, 100, 300, 900, 200);
select test.eq((select recovery_pct from production_batches), 65.00, 'recovery %');
select test.err($$insert into production_batches (date, lot_no, paddy_input_kg, rice_output_kg) values ('2026-10-04', 'L2', 100, 150)$$, 'recovery 100', 'recovery > 100 rejected');
insert into stock_adjustments (date, item, variety, direction, qty_kg, reason) values ('2026-10-04', 'Husk/Tuti', 'whatever', 'Out', 400, 'Boiler Fuel (Husk)');
select test.eq((select variety from stock_adjustments), '', 'husk has no variety');
reset role;

select test.login(:'OWNER');
set role authenticated;
select test.eq((select balance_kg from get_stock_summary() where item = 'Paddy' and variety = 'Super Basmati'), 2880.00, 'paddy stock = 4880 + 2000 - 4000');
select test.eq((select balance_kg from get_stock_summary() where item = 'Paddy' and variety = 'Basmati 1121'), 1000.00, 'other variety paddy');
select test.eq((select balance_kg from get_stock_summary() where item = 'Rice - Full Grain'), 200.00, 'rice stock = 2200 - 2000 sold');
select test.eq((select balance_kg from get_stock_summary() where item = 'Bran/Chokar'), -200.00, 'bran oversold shows negative');
select test.eq((select balance_kg from get_stock_summary() where item = 'Husk/Tuti'), 500.00, 'husk = 900 - 400 boiler');
reset role;

-- ---------------------------------------------------------------- 5b. Products & varieties (managed lists)
select test.eq((select count(*)::int from products), 10, 'default products seeded');
select test.eq((select count(*)::int from varieties), 11, 'default varieties seeded');
select test.login(:'SALES');
set role authenticated;
select test.err($$insert into products (name, category) values ('X', 'rice')$$, 'row-level security', 'sales staff cannot add products');
reset role;
select test.login(:'GODOWN');
set role authenticated;
select test.err($$insert into varieties (name) values ('X')$$, 'row-level security', 'godown cannot add varieties');
reset role;
select test.login(:'MUNSHI');
set role authenticated;
insert into products (name, category, sort_order) values ('  B1   Tota ', 'broken', 23);
select test.eq((select name from products where lower(name) = 'b1 tota'), 'B1 Tota', 'product name cleaned');
select test.err($$insert into products (name, category) values ('b1 tota', 'broken')$$, 'duplicate|unique', 'duplicate product rejected');
select test.err($$insert into products (name, category) values ('Paddy 2', 'paddy')$$, 'sirf ek hi', 'only one paddy product');
select test.err($$update products set name = 'Dhaan' where category = 'paddy'$$, 'nahi badla', 'paddy product protected');
select test.err($$delete from products where category = 'paddy'$$, 'hataya nahi', 'paddy cannot be deleted');
insert into varieties (name) values ('Basmati 1847');
insert into production_batches (date, lot_no, process, variety, paddy_input_kg, outputs, wastage_kg)
values ('2026-10-05', 'LOT-B1', 'Raw', 'Basmati 1847', 1000,
  '[{"product":"rice - full grain","qty_kg":500},{"product":"B1 Tota","qty_kg":"100"},{"product":"Husk/Tuti","qty_kg":200},{"product":"B1 Tota","qty_kg":50},{"product":"Bran/Chokar","qty_kg":0}]', 50);
select test.eq((select recovery_pct from production_batches where lot_no = 'LOT-B1'), 65.00, 'recovery counts the new broken product (650/1000)');
select test.eq((select jsonb_array_length(outputs) from production_batches where lot_no = 'LOT-B1'), 3, 'one line per product, zero lines dropped');
select test.eq((select outputs->0->>'product' from production_batches where lot_no = 'LOT-B1'), 'Rice - Full Grain', 'product spelling from the list');
select test.eq((select rice_output_kg from production_batches where lot_no = 'LOT-B1'), 500.00, 'legacy rice column derived');
select test.err($$insert into production_batches (date, lot_no, paddy_input_kg, outputs) values ('2026-10-05', 'L-X', 100, '[{"product":"Unknown Thing","qty_kg":5}]')$$, 'list mein nahi', 'unknown product rejected');
reset role;
select test.login(:'OWNER');
set role authenticated;
select test.eq((select balance_kg from get_stock_summary() where item = 'B1 Tota' and variety = 'Basmati 1847'), 150.00, 'new product in stock with variety');
select test.eq((select category from get_stock_summary() where item = 'B1 Tota'), 'broken', 'stock knows the category');
select test.eq((select balance_kg from get_stock_summary() where item = 'Paddy' and variety = 'Basmati 1847'), -1000.00, 'paddy of the new variety consumed');
select test.eq((select balance_kg from get_stock_summary() where item = 'Husk/Tuti'), 700.00, 'husk has no variety: 500 + 200');
reset role;
select test.login(:'SALES');
set role authenticated;
insert into sales (date, customer, item, variety, qty_kg, rate) values ('2026-10-07', 'Lahore Rice Co', 'B1 Tota', 'Basmati 1847', 40, 100);
reset role;
select test.login(:'MUNSHI');
set role authenticated;
update products set name = 'B-1 Tota' where name = 'B1 Tota';
select test.eq((select item from sales where qty_kg = 40), 'B-1 Tota', 'product rename cascades to sales');
select test.eq((select outputs->1->>'product' from production_batches where lot_no = 'LOT-B1'), 'B-1 Tota', 'product rename cascades to production');
select test.eq((select balance_kg from get_stock_summary() where item = 'B-1 Tota'), 110.00, 'stock follows the rename (150 - 40)');
select test.err($$delete from products where name = 'B-1 Tota'$$, 'istemal', 'used product cannot be deleted');
insert into products (name, category) values ('Temp Product', 'other');
delete from products where name = 'Temp Product';
update varieties set name = 'Basmati 1121 Kainat' where name = 'Basmati 1121';
select test.eq((select variety from purchases where farmer_name = 'Kisan Nazir'), 'Basmati 1121 Kainat', 'variety rename cascades to purchases');
select test.ok((select description from ledger_entries l join purchases p on p.id = l.source_id where p.farmer_name = 'Kisan Nazir') like '%Basmati 1121 Kainat%', 'khata text refreshed');
insert into varieties (name) values ('Basmati 1847 typo');
insert into stock_adjustments (date, item, variety, direction, qty_kg, reason) values ('2026-10-06', 'Paddy', 'Basmati 1847 typo', 'In', 1000, 'Opening Stock');
select merge_variety((select id from varieties where name = 'Basmati 1847 typo'), (select id from varieties where name = 'Basmati 1847'));
select test.eq((select count(*)::int from varieties where name = 'Basmati 1847 typo'), 0, 'merged variety removed');
select test.eq((select balance_kg from get_stock_summary() where item = 'Paddy' and variety = 'Basmati 1847'), 0.00, 'merged stock: -1000 + 1000');
select test.err($$delete from varieties where name = 'Basmati 1847'$$, 'istemal', 'used variety cannot be deleted');
insert into production_batches (date, lot_no, variety, paddy_input_kg, rice_output_kg, kanki25, bran_kg) values ('2026-10-06', 'LEGACY', 'Super Basmati', 100, 50, 10, 5);
select test.eq((select jsonb_array_length(outputs) from production_batches where lot_no = 'LEGACY'), 3, 'legacy columns converted');
select test.eq((select recovery_pct from production_batches where lot_no = 'LEGACY'), 60.00, 'legacy recovery');
update production_batches set outputs = '[]' where lot_no = 'LEGACY';
select test.eq((select jsonb_array_length(outputs) || '|' || rice_output_kg from production_batches where lot_no = 'LEGACY'), '0|0.00', 'clearing outputs is respected');
delete from production_batches where lot_no = 'LEGACY';
reset role;

-- ---------------------------------------------------------------- 6. Labor khata
select test.login(:'MUNSHI');
set role authenticated;
insert into payments (date, party_type, party_name, direction, method, amount) values ('2026-10-01', 'Labor', 'Ghulam Rasool', 'Paid', 'Cash', 1000);
insert into labor_entries (name, date, pay_type, rate_or_wage, units_or_days, advance_deducted) values ('Ghulam Rasool', '2026-10-07', 'Daily', 1000, 6, 1000);
select test.eq((select gross || '|' || net_pay from labor_entries), '6000.00|5000.00', 'wage calc');
select test.eq((select balance from get_party_balances() where party_name = 'Ghulam Rasool'), 5000.00, 'unpaid wages owed');
update labor_entries set paid = true, paid_date = '2026-10-08' where name = 'Ghulam Rasool';
select test.eq((select balance from get_party_balances() where party_name = 'Ghulam Rasool'), 0.00, 'paid -> settled (advance recovered)');
update labor_entries set paid = false where name = 'Ghulam Rasool';
select test.eq((select paid_date from labor_entries), null::date, 'unpaid clears date');
select test.eq((select count(*)::int from ledger_entries where source = 'labor_pay'), 0, 'unpaid removes payment entry');
update labor_entries set paid = true, paid_date = '2026-10-08' where name = 'Ghulam Rasool';

-- expenses on udhaar -> supplier khata
insert into expenses (date, category, description, amount, paid_via, party_name) values ('2026-10-07', 'Diesel', '200 litre', 60000, 'Udhaar', 'Shell Pump');
select test.eq((select credit from ledger_entries where source = 'expense'), 60000.00, 'udhaar diesel in supplier khata');
update expenses set paid_via = 'Cash' where party_name = 'Shell Pump';
select test.eq((select count(*)::int from ledger_entries where source = 'expense'), 0, 'cash expense not in khata');
update expenses set paid_via = 'Udhaar' where party_name = 'Shell Pump';
select test.err($$insert into expenses (date, category, amount, paid_via) values ('2026-10-07', 'Diesel', 100, 'Udhaar')$$, 'supplier', 'udhaar needs supplier');
insert into machinery_log (date, machine, issue_description, cost, paid_via) values ('2026-10-07', 'Huller', 'rubber roll', 15000, 'Cash');
insert into transport_entries (date, entry_type, vehicle_no, party_name, qty_kg, freight_rate_per_kg, paid_via) values ('2026-10-06', 'Delivery', 'les-4021', 'Butt Goods', 2000, 2.5, 'Udhaar');
select test.eq((select total_amount || '|' || vehicle_no from transport_entries), '5000.00|LES-4021', 'transport total & vehicle upper');
select test.eq((select party_type || '|' || credit from ledger_entries where source = 'transport'), 'Transporter|5000.00', 'transport udhaar khata');
insert into cash_entries (date, account, direction, category, amount) values ('2026-10-01', 'Cash', 'In', 'Opening Balance', 700000);
insert into cash_entries (date, category, amount, account, direction) values ('2026-10-06', 'Cash to Bank', 50000, 'Bank', 'In');
select test.eq((select account || '|' || direction from cash_entries where category = 'Cash to Bank'), 'Cash|Out', 'transfer normalised');
reset role;

-- cash book
select test.login(:'OWNER');
set role authenticated;
-- cash: +700000 opening -50000 purchase spot -100000 payment(cash) +100000 sale spot -1000 labour adv
--       -15000 machinery -5000 wages net (paid 10-08) -50000 to bank
select test.eq((select balance from get_cash_balances(null) where account = 'Cash'), 579000.00, 'cash in hand');
-- bank: -83100 cleared cheque (due 10-20) +50000 transfer
select test.eq((select balance from get_cash_balances(null) where account = 'Bank'), -33100.00, 'bank balance');
select test.eq((select balance from get_cash_balances('2026-10-06') where account = 'Cash'), 549000.00, 'opening cash on 10-06');
select test.eq((select count(*)::int from get_cash_book('2026-10-06', '2026-10-06')), 3, 'day book rows on 10-06 (sale + 2 transfer legs)');
select test.ok((get_dashboard_stats('2026-10-06', '2026-10-01')->>'today_sale_count')::int = 2, 'dashboard stats');
select test.eq((get_dashboard_stats('2026-10-06', null)->>'season_paddy_kg')::numeric, 7880.00, 'season paddy kg');
reset role;

-- ---------------------------------------------------------------- 7. Parties: opening, rename, merge, delete
select test.login(:'MUNSHI');
set role authenticated;
insert into parties (party_type, name, opening_balance, opening_date) values ('Kisan', 'Muhammad Iqbal', -20000, '2026-09-30');
select test.eq((select debit from ledger_entries where source = 'opening'), 20000.00, 'opening receivable posted');
update parties set opening_balance = 15000 where name = 'Muhammad Iqbal';
select test.eq((select credit || '|' || debit from ledger_entries where source = 'opening'), '15000.00|0.00', 'opening updated');
update parties set name = 'Allah Ditta Sons' where party_type = 'Kisan' and name = 'Allah Ditta';
select test.eq((select farmer_name from purchases where slip_no = 'PS-00001'), 'Allah Ditta Sons', 'rename cascades to purchases');
select test.eq((select count(*)::int from ledger_entries where party_name = 'Allah Ditta'), 0, 'no khata left on old name');
select test.eq((select balance from get_party_balances() where party_name = 'Allah Ditta Sons'), 350200.00, 'balance follows rename');
select test.err($$delete from parties where name = 'Allah Ditta Sons'$$, 'entries maujood', 'cannot delete party with khata');
-- duplicate typo party, then merge
insert into payments (date, party_type, party_name, direction, method, amount) values ('2026-10-09', 'Kisan', 'Allah Dita Sons', 'Paid', 'Cash', 200);
select merge_party((select id from parties where name = 'Allah Dita Sons'), (select id from parties where name = 'Allah Ditta Sons'));
select test.eq((select count(*)::int from parties where name = 'Allah Dita Sons'), 0, 'merged party removed');
select test.eq((select balance from get_party_balances() where party_name = 'Allah Ditta Sons'), 350000.00, 'merged balance');
insert into parties (party_type, name) values ('Supplier', 'Temp Supplier');
delete from parties where name = 'Temp Supplier';
reset role;

select test.login(:'SALES');
set role authenticated;
select test.err($$select merge_party((select id from parties where name = 'Muhammad Iqbal'), (select id from parties where name = 'Allah Ditta Sons'))$$, 'ijazat', 'sales staff cannot merge');
reset role;

-- ---------------------------------------------------------------- 7b. deleting source records cleans their khata
select test.login(:'MUNSHI');
set role authenticated;
insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-09', 'Del Test', 'X', 500, 100, 1000);
insert into sales (date, customer, item, qty_kg, rate) values ('2026-10-09', 'Del Cust', 'Other', 10, 10);
insert into payments (date, party_type, party_name, direction, method, amount) values ('2026-10-09', 'Other', 'Del Pay', 'Paid', 'Cash', 10);
insert into labor_entries (name, date, rate_or_wage, units_or_days, paid) values ('Del Labor', '2026-10-09', 100, 1, true);
insert into expenses (date, category, amount, paid_via, party_name) values ('2026-10-09', 'Other', 10, 'Udhaar', 'Del Sup');
insert into machinery_log (date, machine, cost, paid_via, party_name) values ('2026-10-09', 'Other', 10, 'Udhaar', 'Del Sup');
insert into transport_entries (date, entry_type, qty_kg, freight_rate_per_kg, paid_via, party_name) values ('2026-10-09', 'Delivery', 10, 1, 'Udhaar', 'Del Trans');
select test.eq((select count(*)::int from ledger_entries where party_name like 'Del %'), 8, 'auto entries created for every source (labor = 2)');
delete from purchases where farmer_name = 'Del Test';
delete from sales where customer = 'Del Cust';
delete from payments where party_name = 'Del Pay';
delete from labor_entries where name = 'Del Labor';
delete from expenses where party_name = 'Del Sup';
delete from machinery_log where party_name = 'Del Sup';
delete from transport_entries where party_name = 'Del Trans';
select test.eq((select count(*)::int from ledger_entries where party_name like 'Del %'), 0, 'deleting the source removes its khata entries');
select test.err($$update ledger_entries set credit = 1 where source <> 'manual'$$, 'khud bani', 'guard still active after cleanups');
reset role;

-- ---------------------------------------------------------------- 8. activity log
select test.ok((select count(*) from activity_log where table_name = 'purchases' and action = 'INSERT') = 4, 'activity log records inserts');
select test.ok((select count(*) from activity_log where user_id = :'MUNSHI') > 0, 'activity log records who');

-- ---------------------------------------------------------------- 8b. v5.2: export, sauda, kanta, lock, audit, analytics, aging
select test.login(:'SALES');
set role authenticated;
insert into contracts (date, kind, party_name, item, variety, qty_kg, rate, rate_unit, currency, fx_rate, delivery_to, payment_terms)
values ('2026-10-08', 'sale', 'Dubai Foods LLC', 'Rice - Full Grain', 'Super Basmati', 20000, 950, 'mt', 'usd', 280, '2026-11-30', 'LC at sight');
select test.eq((select contract_no || '|' || party_type || '|' || currency from contracts where party_name = 'Dubai Foods LLC'), 'SC-00001|Customer|USD', 'sale contract numbered');
select test.err($$insert into contracts (date, kind, party_name, qty_kg, rate) values ('2026-10-08', 'purchase', 'Rana Traders', 1000, 3000)$$, 'row-level security', 'sales staff cannot book a purchase sauda');
insert into sales (date, customer, type, item, variety, qty_kg, rate, rate_unit, currency, fx_rate, contract_id, port_loading, port_discharge, vessel, bl_no, packing, gross_weight_kg, bags)
values ('2026-10-09', 'Dubai Foods LLC', 'Export', 'Rice - Full Grain', 'Super Basmati', 10000, 950, 'mt', 'USD', 280,
        (select id from contracts where contract_no = 'SC-00001'), 'Karachi (KICT)', 'Jebel Ali', 'MSC Aurora', 'BL-7788', '25 kg PP bags', 10080, 400);
select test.eq((select amount_fc || '|' || amount from sales where customer = 'Dubai Foods LLC'), '9500.00|2660000.00', 'USD per MT -> PKR');
select test.eq((select debit from ledger_entries where source = 'sale' and party_name = 'Dubai Foods LLC'), 2660000.00, 'export khata in PKR');
select test.err($$insert into sales (date, customer, item, qty_kg, rate, currency, fx_rate) values ('2026-10-09', 'X', 'Other', 10, 1, 'USD', 0)$$, 'exchange rate', 'fx rate required');
select test.eq((select delivered_kg from get_contract_progress() where contract_id = (select id from contracts where contract_no = 'SC-00001')), 10000.00, 'sauda progress');
reset role;
select test.login(:'MUNSHI');
set role authenticated;
insert into contracts (date, kind, party_type, party_name, variety, qty_kg, rate, rate_unit) values ('2026-10-08', 'purchase', 'Arhti', 'Rana Traders', 'Super Basmati', 40000, 3700, 'maund');
select test.eq((select contract_no || '|' || item from contracts where kind = 'purchase'), 'PC-00001|Paddy', 'purchase contract numbered, item paddy');
select test.err($$insert into purchases (date, mode, arhti_name, variety, gross_wt, tare_wt, rate_per_maund, contract_id) values ('2026-10-09', 'Arhti', 'Rana Traders', 'Super Basmati', 1000, 0, 3700, (select id from contracts where kind = 'sale'))$$, 'kharid', 'sale sauda cannot take a purchase');
-- weighbridge: in, out, fee to rokar
insert into weighments (date, kind, vehicle_no, party_name, item, first_wt) values ('2026-10-09', 'Public', 'lhr 555', 'Outside Trader', 'Wheat', 25000);
select test.eq((select slip_no || '|' || status || '|' || vehicle_no from weighments), 'WB-00001|Open|LHR 555', 'first weight = open');
update weighments set second_wt = 9000, fee = 500 where slip_no = 'WB-00001';
select test.eq((select status || '|' || net_wt from weighments), 'Done|16000.00', 'second weight completes it');
select test.eq((select amount from get_cash_book('2026-10-09', '2026-10-09') where source = 'weighment'), 500.00, 'kanta fee in rokar');
-- audit keeps old values
update purchases set rate_per_maund = 4150 where slip_no = 'PS-00002';
reset role;
select test.eq((select old_details->>'rate_per_maund' from activity_log where table_name = 'purchases' and action = 'UPDATE' order by id desc limit 1), '3600', 'audit stores the old value');
select test.eq((select details->>'rate_per_maund' from activity_log where table_name = 'purchases' and action = 'UPDATE' order by id desc limit 1), '4150', 'audit stores the new value');
-- period lock
select test.login(:'MUNSHI');
set role authenticated;
insert into labor_entries (name, date, rate_or_wage, units_or_days) values ('Lock Test', '2026-10-02', 1000, 1);
insert into payments (date, party_type, party_name, direction, method, amount, cheque_no, due_date) values ('2026-10-02', 'Kisan', 'Muhammad Iqbal', 'Paid', 'Cheque', 5000, 'L-1', '2026-10-20');
reset role;
select test.login(:'OWNER');
set role authenticated;
update settings set lock_date = '2026-10-03' where id = 1;
select test.err($$delete from purchases where slip_no = 'PS-00001'$$, 'band \(lock\)', 'owner too cannot delete a locked entry');
reset role;
select test.login(:'MUNSHI');
set role authenticated;
select test.err($$insert into expenses (date, category, amount) values ('2026-10-02', 'Other', 10)$$, 'band \(lock\)', 'no back-dated entry into a locked period');
select test.err($$update purchases set rate_per_maund = 1 where slip_no = 'PS-00001'$$, 'band \(lock\)', 'locked entry cannot be edited');
select test.err($$update expenses set date = '2026-10-01' where party_name = 'Shell Pump'$$, 'band \(lock\)', 'cannot move an entry into a locked period');
select test.err($$insert into ledger_entries (date, party_type, party_name, debit) values ('2026-10-01', 'Other', 'X', 1)$$, 'band \(lock\)', 'manual khata locked too');
update labor_entries set paid = true, paid_date = '2026-10-12', paid_via = 'Cash' where name = 'Lock Test';
select test.eq((select paid from labor_entries where name = 'Lock Test'), true, 'old wages can still be paid');
update payments set status = 'Cleared' where cheque_no = 'L-1';
select test.eq((select status from payments where cheque_no = 'L-1'), 'Cleared', 'old cheque can still clear');
insert into expenses (date, category, amount) values ('2026-10-04', 'Other', 10);
reset role;
select test.login(:'OWNER');
set role authenticated;
update settings set lock_date = null where id = 1;
delete from expenses where date = '2026-10-04' and category = 'Other' and amount = 10;
-- aging (FIFO): 1000 (Jun) + 500 (Aug) + 300 (Oct) owed, 900 received -> 100 old, 500 mid, 300 new
insert into ledger_entries (date, party_type, party_name, description, debit) values ('2026-06-01', 'Customer', 'Aging Test', 'bill 1', 1000), ('2026-08-15', 'Customer', 'Aging Test', 'bill 2', 500), ('2026-10-01', 'Customer', 'Aging Test', 'bill 3', 300);
insert into ledger_entries (date, party_type, party_name, description, credit) values ('2026-10-05', 'Customer', 'Aging Test', 'received', 900);
select test.eq((select side || '|' || balance || '|' || d0_30 || '|' || d31_60 || '|' || d61_90 || '|' || d90_plus || '|' || oldest from get_aging('2026-10-12') where party_name = 'Aging Test'),
               'receivable|900.00|300.00|500.00|0.00|100.00|2026-06-01', 'aging buckets FIFO');
select test.ok((select sum(d0_30 + d31_60 + d61_90 + d90_plus) = sum(balance) from get_aging('2026-10-12')), 'aging buckets add up to balances');
-- analytics
select test.eq((get_analytics('2026-10-01', '2026-10-31', 'day')->>'bucket'), 'day', 'analytics bucket');
select test.eq(jsonb_array_length(get_analytics('2026-10-01', '2026-10-31', 'auto')->'series'), 31, 'one point per day');
select test.eq((get_analytics('2026-10-01', '2026-10-31', 'day')->'kpi'->>'purchase_kg')::numeric, (select sum(net_wt) from purchases where date between '2026-10-01' and '2026-10-31'), 'analytics kpi = register');
select test.eq((get_analytics('2026-10-01', '2026-10-31', 'day')->'kpi'->>'sale_value')::numeric, (select sum(amount) from sales where date between '2026-10-01' and '2026-10-31'), 'analytics sales (excl. tax)');
select test.ok(jsonb_array_length(get_analytics(null, null, 'month')->'top_customers') >= 1, 'top customers');
select test.ok((get_analytics('2026-10-01', '2026-10-31', 'week')->'rates'->0->>'variety') is not null, 'rate trend per variety');
reset role;
select test.login(null);
set role anon;
select test.err($$select get_analytics(null, null, 'auto')$$, 'permission denied', 'anon cannot read analytics');
reset role;

-- ---------------------------------------------------------------- 8c. v5.3: sukhai, bardana, moisture rule, laagat
select test.eq((select moisture_base_pct || '|' || moisture_kg_per_point from settings), '0|0', 'moisture rule off by default');
select test.login(:'OWNER');
set role authenticated;
update settings set moisture_base_pct = 14, moisture_kg_per_point = 1 where id = 1;
update settings set moisture_kg_per_point = null where id = 1;
reset role;
select test.eq((select moisture_base_pct || '|' || moisture_kg_per_point from settings), '14|0', 'null rule value -> 0');
update settings set moisture_kg_per_point = 1 where id = 1;
create table test.paddy_sb as select balance_kg from get_stock_summary() where item = 'Paddy' and variety = 'Super Basmati';
grant select on test.paddy_sb to public;
select test.login(:'GODOWN');
set role authenticated;
insert into drying_batches (date, variety, lot_ref, method, weight_before_kg, weight_after_kg, moisture_before, moisture_after)
values ('2026-10-08', 'Super Basmati', 'Dher 3', 'Dryer (machine)', 1000, 950, 19, 14);
select test.eq((select loss_kg from drying_batches), 50.00, 'drying loss');
select test.err($$insert into drying_batches (date, variety, weight_before_kg, weight_after_kg) values ('2026-10-08', 'Super Basmati', 100, 120)$$, 'zyada nahi', 'after > before rejected');
select test.err($$insert into drying_batches (date, weight_before_kg, weight_after_kg) values ('2026-10-08', 100, 90)$$, 'variety', 'variety required');
reset role;
select test.login(:'SALES');
set role authenticated;
select test.err($$insert into drying_batches (date, variety, weight_before_kg, weight_after_kg) values ('2026-10-08', 'Super Basmati', 100, 90)$$, 'row-level security', 'sales staff cannot record drying');
select test.err($$insert into bag_movements (date, movement, bag_type, qty) values ('2026-10-08', 'Purchased', 'Jute', 10)$$, 'row-level security', 'sales staff cannot move bags');
reset role;
select test.login(:'MUNSHI');
set role authenticated;
insert into bag_movements (date, movement, bag_type, qty) values ('2026-09-25', 'Purchased', 'Jute', 1000);
insert into bag_movements (date, movement, party_type, party_name, bag_type, qty) values ('2026-09-26', 'Issued', 'Arhti', 'rana traders', 'Jute', 500);
insert into bag_movements (date, movement, party_type, party_name, bag_type, qty) values ('2026-10-02', 'Returned', 'Arhti', 'Rana Traders', 'Jute', 200);
insert into bag_movements (date, movement, party_type, party_name, bag_type, qty, rate, charge_to_party) values ('2026-10-06', 'Issued', 'Arhti', 'Rana Traders', 'Jute', 100, 50, true);
select test.eq((select party_name || '|' || debit from ledger_entries where source = 'bags'), 'Rana Traders|5000.00', 'charged bags in the khata (canonical name)');
select test.eq((select qty from get_bag_balances() where holder = 'party' and party_name ilike 'rana traders' and bag_type = 'Jute'), 400, 'bags with the arhti: 500 + 100 - 200');
select test.eq((select qty from get_bag_balances() where holder = 'mill' and bag_type = 'Jute'), 600, 'mill bag stock: 1000 - 600 + 200');
select test.err($$insert into bag_movements (date, movement, bag_type, qty) values ('2026-10-06', 'Issued', 'Jute', 5)$$, 'naam likhein', 'issue needs a party');
select test.err($$insert into bag_movements (date, movement, party_name, bag_type, qty, charge_to_party) values ('2026-10-06', 'Issued', 'X', 'Jute', 5, true)$$, 'rate', 'charge needs a rate');
insert into bag_movements (date, movement, party_type, party_name, bag_type, qty, rate, charge_to_party) values ('2026-10-06', 'Issued', 'Arhti', 'Tmp Bags', 'PP', 10, 30, true);
delete from bag_movements where party_name = 'Tmp Bags';
select test.eq((select count(*)::int from ledger_entries where source = 'bags' and party_name = 'Tmp Bags'), 0, 'deleting a bag entry cleans its khata');
reset role;
select test.login(:'OWNER');
set role authenticated;
select test.eq((select balance_kg from get_stock_summary() where item = 'Paddy' and variety = 'Super Basmati'), (select balance_kg - 50 from test.paddy_sb), 'drying loss leaves the paddy stock');
select test.ok((select (c->>'net_cost')::numeric = (c->>'paddy_cost')::numeric + (c->>'drying_cost')::numeric + (c->>'processing')::numeric - (c->>'byproduct_value')::numeric
                from get_costing('2026-10-01', '2026-10-31') c), 'laagat adds up');
select test.ok((select (c->>'rice_kg')::numeric > 0 and (c->>'cost_per_kg')::numeric > 0 and (c->>'drying_kg')::numeric = 50
                from get_costing('2026-10-01', '2026-10-31') c), 'laagat per kg and drying loss');
select test.eq((select round((c->>'cost_per_kg')::numeric * (c->>'rice_kg')::numeric, 0) from get_costing('2026-10-01', '2026-10-31') c),
               (select round((c->>'net_cost')::numeric, 0) from get_costing('2026-10-01', '2026-10-31') c), 'cost per kg x rice = net cost');
reset role;
select test.login(null);
set role anon;
select test.err($$select get_costing(null, null)$$, 'permission denied', 'anon cannot read costing');
reset role;

-- ---------------------------------------------------------------- 8d. v5.4: manager, per-action permissions, delete options
\set MANAGER '77777777-7777-7777-7777-777777777777'
insert into auth.users (id, email, raw_user_meta_data) values (:'MANAGER', 'manager@mill.pk', '{"full_name":"Manager Sahib"}');
set role service_role;
update profiles set role = 'manager' where id = :'MANAGER';
reset role;
select test.login(:'MANAGER');
set role authenticated;
select test.eq((select count(*)::int from profiles), 6, 'manager sees all staff accounts');
select test.ok((select count(*) from activity_log) > 0, 'manager can read the activity log');
select test.err($$select admin_update_profile('11111111-1111-1111-1111-111111111111', 'x', 'munshi', 'active')$$, 'owner ya doosre manager', 'manager cannot touch the owner');
select test.err($$select admin_update_profile('22222222-2222-2222-2222-222222222222', 'Munshi Sahib', 'owner', 'active')$$, 'sirf owner', 'manager cannot make an owner');
select test.err($$select admin_update_profile('22222222-2222-2222-2222-222222222222', 'Munshi Sahib', 'manager', 'active')$$, 'sirf owner', 'manager cannot make a manager');
select test.err($$select admin_update_profile('77777777-7777-7777-7777-777777777777', 'Manager Sahib', 'munshi', 'active')$$, 'khud ka role', 'manager cannot change own role');
select test.err($$select admin_set_permissions('77777777-7777-7777-7777-777777777777', '{}')$$, 'khud nahi', 'manager cannot change own permissions');
select test.err($$select owner_reset_all_data('everything')$$, 'sirf owner', 'manager cannot reset');
select test.err($$select owner_delete_data(array['expenses'], '2026-01-01', '2026-12-31')$$, 'sirf owner', 'manager cannot bulk delete');
-- custom permissions: munshi may add/edit purchases but not delete; sales staff cannot see the khata or cash book
select admin_set_permissions(:'MUNSHI', '{"purchase": {"add": true, "edit": true, "delete": false}, "junk": {"view": true}}');
select admin_set_permissions(:'SALES', '{"ledger": {"view": false}, "cashbook": {"view": false}, "payments": {"view": false, "add": false}}');
reset role;
select test.eq((select permissions from profiles where id = :'MUNSHI'), '{"purchase": {"add": true, "edit": true, "view": true, "delete": false}}'::jsonb, 'unknown modules dropped, write implies view');
select test.login(:'MUNSHI');
set role authenticated;
insert into purchases (date, farmer_name, variety, gross_wt, tare_wt, rate_per_maund) values ('2026-10-10', 'Perm Test', 'Super Basmati', 500, 100, 4000);
update purchases set rate_per_maund = 4100 where farmer_name = 'Perm Test';
delete from purchases where farmer_name = 'Perm Test';
select test.eq((select count(*)::int from purchases where farmer_name = 'Perm Test'), 1, 'delete right removed: row stays');
reset role;
select test.login(:'SALES');
set role authenticated;
select test.eq((select count(*)::int from ledger_entries), 0, 'khata hidden from this sales user');
select test.eq((select count(*)::int from payments), 0, 'payments hidden from this sales user');
select test.ok((select count(*) from sales) > 0, 'sales still visible');
select test.ok(can_do('sales', 'add') and not can_do('ledger', 'view'), 'can_do reflects the custom permissions');
reset role;
select test.login(:'MANAGER');
set role authenticated;
select admin_set_permissions(:'SALES', '{}');
reset role;
select test.login(:'SALES');
set role authenticated;
select test.ok((select count(*) from ledger_entries) > 0, 'back to role defaults');
reset role;
-- delete options (Owner): chosen registers within dates, khata follows, lock respected
select test.login(:'OWNER');
set role authenticated;
delete from purchases where farmer_name = 'Perm Test';
insert into expenses (date, category, amount, paid_via, party_name) values ('2026-03-05', 'Other', 100, 'Udhaar', 'Old Supplier'), ('2026-03-06', 'Other', 200, 'Cash', '');
select test.eq((select owner_delete_data(array['expenses'], '2026-03-01', '2026-03-31')->>'expenses'), '2', 'range delete count');
select test.eq((select count(*)::int from ledger_entries where party_name = 'Old Supplier' and source = 'expense'), 0, 'khata entries follow the deleted records');
select test.err($$select owner_delete_data(array['activity_log'], '2026-01-01', '2026-12-31')$$, 'nahi ho sakta', 'audit log cannot be bulk deleted');
update settings set lock_date = '2026-03-31' where id = 1;
insert into payments (date, party_type, party_name, direction, method, amount) values ('2026-04-02', 'Other', 'Lock Del', 'Paid', 'Cash', 10);
select test.err($$select owner_delete_data(array['payments'], '2026-01-01', '2026-12-31')$$, 'band \(lock\)', 'range delete refuses locked days');
update settings set lock_date = null where id = 1;
select test.eq((select owner_delete_data(array['payments'], '2026-04-01', '2026-04-30')->>'payments'), '1', 'unlocked range deletes');
select test.eq((select count(*)::int from activity_log where action = 'DELETE_RANGE'), 2, 'range deletes are logged');
reset role;

-- ---------------------------------------------------------------- 9. backup -> reset (carry forward) -> restore
create table test.backup as
select jsonb_build_object(
  'settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from settings t),
  'products', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from products t),
  'varieties', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from varieties t),
  'parties', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from parties t),
  'purchases', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from purchases t),
  'ledger_entries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from ledger_entries t),
  'production_batches', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from production_batches t),
  'stock_lots', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from stock_lots t),
  'stock_adjustments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from stock_adjustments t),
  'sales', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from sales t),
  'payments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from payments t),
  'labor_entries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from labor_entries t),
  'transport_entries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from transport_entries t),
  'machinery_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from machinery_log t),
  'expenses', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from expenses t),
  'tax_records', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from tax_records t),
  'zakat_assessments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from zakat_assessments t),
  'cash_entries', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from cash_entries t),
  'contracts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from contracts t),
  'weighments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from weighments t),
  'drying_batches', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from drying_batches t),
  'bag_movements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from bag_movements t)
) as data;
create table test.bal_before as select party_type, party_name, balance from get_party_balances();
create table test.stock_before as select item, variety, balance_kg from get_stock_summary();
create table test.cash_before as select account, balance from get_cash_balances(null);
create table test.bags_before as select holder, party_name, bag_type, qty from get_bag_balances() where qty <> 0;
grant select on all tables in schema test to public;

select test.login(:'MUNSHI');
set role authenticated;
select test.err($$select owner_reset_all_data('carry_forward')$$, 'sirf owner', 'munshi cannot reset');
reset role;

select test.login(:'OWNER');
set role authenticated;
select owner_reset_all_data('carry_forward');
select test.eq((select count(*)::int from purchases), 0, 'purchases wiped');
select test.eq((select qty_kg || '|' || status from contracts where kind = 'sale'), '10000.00|Open', 'open sauda carried forward with the pending qty');
select test.eq((select count(*)::int from weighments), 0, 'weighments wiped');
select test.ok(not exists (
  select 1 from test.bags_before b full join (select holder, party_name, bag_type, qty from get_bag_balances() where qty <> 0) a
    on a.holder = b.holder and lower(a.party_name) = lower(b.party_name) and a.bag_type = b.bag_type
  where coalesce(a.qty, 0) <> coalesce(b.qty, 0)), 'carry forward keeps every bag balance');
select test.eq((select count(*)::int from drying_batches), 0, 'drying log wiped');
select test.eq((select count(*)::int from activity_log where action = 'RESET'), 1, 'reset logged');
select test.eq((select count(*)::int from activity_log), 1, 'only the reset marker logged');
select test.ok(not exists (
  select 1 from test.bal_before b full join get_party_balances() a on a.party_type = b.party_type and a.party_name = b.party_name
  where coalesce(a.balance, 0) <> coalesce(b.balance, 0)), 'carry forward keeps every party balance');
select test.ok(not exists (
  select 1 from test.stock_before b full join get_stock_summary() a on a.item = b.item and a.variety = b.variety
  where coalesce(a.balance_kg, 0) <> coalesce(b.balance_kg, 0)), 'carry forward keeps stock');
select test.ok(not exists (
  select 1 from test.cash_before b join get_cash_balances(null) a using (account) where a.balance <> b.balance), 'carry forward keeps cash/bank');
reset role;
select test.eq((select coalesce(sum(value), 0)::int from doc_counters where name in ('sale_invoice', 'purchase_slip', 'weighment')), 0, 'document numbers restart');
select test.eq((select value::int from doc_counters where name = 'sale_contract'), 1, 'carried sauda keeps its number, next one continues');
select test.login(:'OWNER');
set role authenticated;
select test.err($$select * from doc_counters$$, 'permission denied', 'counters hidden from API');

select owner_restore_backup((select data from test.backup));
select test.eq((select count(*)::int from purchases), 3, 'purchases restored');
select test.eq((select count(*)::int from contracts), 2, 'contracts restored');
select test.eq((select count(*)::int from drying_batches) || '|' || (select count(*)::int from bag_movements), '1|4', 'drying + bags restored');
select test.eq((select delivered_kg from get_contract_progress() where contract_id = (select id from contracts where contract_no = 'SC-00001')), 10000.00, 'restored sale still linked to its sauda');
select test.eq((select count(*)::int from sales), 4, 'sales restored');
select test.ok(not exists (
  select 1 from test.bal_before b full join get_party_balances() a on a.party_type = b.party_type and a.party_name = b.party_name
  where coalesce(a.balance, 0) <> coalesce(b.balance, 0)), 'restore rebuilds identical khata');
select test.ok(not exists (
  select 1 from test.stock_before b full join get_stock_summary() a on a.item = b.item and a.variety = b.variety
  where coalesce(a.balance_kg, 0) <> coalesce(b.balance_kg, 0)), 'restore rebuilds identical stock');
select test.ok(not exists (
  select 1 from test.cash_before b join get_cash_balances(null) a using (account) where a.balance <> b.balance), 'restore rebuilds identical cash');
insert into sales (date, customer, item, qty_kg, rate) values ('2026-10-09', 'Walk-in', 'Kanki 25%', 10, 100);
select test.eq((select invoice_no from sales where customer = 'Walk-in'), 'INV-00006', 'invoice sequence continues after restore (deleted INV-00004 stays a gap)');
select test.eq((select count(*)::int from products where name = 'B-1 Tota'), 1, 'restore brings products back');
select test.eq((select count(*)::int from activity_log where action = 'RESTORE'), 1, 'restore logged');

select owner_reset_all_data('keep_parties');
select test.eq((select count(*)::int from ledger_entries), 0, 'keep_parties: khata empty');
select test.ok((select count(*) from parties) > 0, 'keep_parties: parties kept');
select owner_reset_all_data('everything');
select test.eq((select count(*)::int from parties), 0, 'everything: parties gone');
select test.eq((select count(*)::int from profiles), 6, 'logins untouched by reset');
select test.ok((select count(*) from products) >= 11 and (select count(*) from varieties) >= 11, 'reset keeps products & varieties');
reset role;

select 'ALL TESTS PASSED' as result;
