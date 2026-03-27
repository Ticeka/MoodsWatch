-- Drop duplicate index on discover_search_events.
--
-- idx_dse_event_date (created in 20260322010000) is identical to
-- idx_discover_search_events_type_created_at (created in 20260321120000):
-- both index (event_type, created_at desc).
--
-- Keep the more descriptive name; drop the duplicate.

drop index if exists public.idx_dse_event_date;
