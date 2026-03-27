-- ============================================================
-- Tierlist list_id indexes
-- Advisor confirmed: DELETE WHERE list_id = $1 does seq scan
--
-- tierlist_list_pool_items: 28,366 calls/period, mean 5.5ms
-- tierlist_list_rows:       28,448 calls/period, mean 5.4ms
--
-- These DELETEs run every time a user saves/resets a tierlist.
-- Without list_id index, each DELETE scans the full table.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tierlist_list_pool_items_list_id
  ON public.tierlist_list_pool_items (list_id);

CREATE INDEX IF NOT EXISTS idx_tierlist_list_rows_list_id
  ON public.tierlist_list_rows (list_id);
