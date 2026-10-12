-- ============================================================================
-- Kanta Khata — migration for any existing project. Enables Supabase Realtime
-- on every operational table, so edits/inserts/deletes appear instantly for
-- everyone looking at the same module — no manual refresh, no polling delay.
--
-- If you're setting up a brand-new Supabase project, ignore this file and
-- just run supabase/schema.sql instead — it already includes everything below.
--
-- Select everything below and Run. Safe to run more than once.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['purchases','ledger_entries','production_batches','stock_lots','sales',
                            'payments','labor_entries','transport_entries','machinery_log','expenses',
                            'tax_records','zakat_assessments','activity_log','profiles']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- Done. No app-side database changes needed — just deploy the updated
-- frontend build, which now subscribes to these tables automatically.
-- ============================================================================
