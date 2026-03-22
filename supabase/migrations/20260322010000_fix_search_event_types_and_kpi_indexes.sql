-- Migration: fix event_type check constraint + add KPI-support indexes
-- Fixes: search_submit / search_abandon / no_results_view / autocomplete_select / recovery_apply
--        were tracked in the app but rejected by the DB constraint.
-- Also adds indexes to support the Phase 6 search KPI dashboard queries.

-- ── 1. Fix event_type check constraint ─────────────────────────────────────
-- Drop the old constraint by name (Postgres names it after the column).
-- We rely on the standard naming convention <table>_<column>_check.
-- Use a DO block so the migration is idempotent if run twice.

do $$
begin
  alter table public.discover_search_events
    drop constraint if exists discover_search_events_event_type_check;

  alter table public.discover_search_events
    add constraint discover_search_events_event_type_check
      check (event_type in (
        'search_view',
        'search_submit',
        'search_abandon',
        'no_results_view',
        'preset_apply',
        'result_click',
        'autocomplete_select',
        'recovery_apply',
        'saved_search_create',
        'saved_search_update',
        'saved_search_delete'
      ));
end;
$$;

-- ── 2. KPI indexes ──────────────────────────────────────────────────────────

-- Autocomplete CTR, submit rate, zero-result rate — filter by event_type over time
-- Note: (created_at::date) is not IMMUTABLE (timezone-dependent), use plain created_at.
create index if not exists idx_dse_event_date
  on public.discover_search_events (event_type, created_at desc);

-- Recovery success rate — recovery_apply after no_results_view
create index if not exists idx_dse_session_event
  on public.discover_search_events (session_id, event_type, created_at desc);

-- Result click-through by group (result_type breakdown)
create index if not exists idx_dse_result_type_event
  on public.discover_search_events (result_type, event_type, created_at desc)
  where result_type is not null;

-- Top queries (normalized_query) — existing index covers this, ensure it exists
create index if not exists idx_dse_normalized_query_type
  on public.discover_search_events (normalized_query, event_type, created_at desc)
  where normalized_query <> '';

-- Zero-result queries by normalized_query
create index if not exists idx_dse_no_results_query
  on public.discover_search_events (normalized_query, created_at desc)
  where event_type = 'no_results_view';

-- Autocomplete selections — top clicked suggestions
create index if not exists idx_dse_autocomplete_select
  on public.discover_search_events (normalized_query, result_id, created_at desc)
  where event_type = 'autocomplete_select';

-- User-level breakdown (CTR per user cohort)
create index if not exists idx_dse_user_event_date
  on public.discover_search_events (user_id, event_type, created_at desc)
  where user_id is not null;
