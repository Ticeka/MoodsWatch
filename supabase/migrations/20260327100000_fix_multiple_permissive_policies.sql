-- Fix multiple_permissive_policies linter warnings.
--
-- Root cause: "FOR ALL" staff/user manage policies also cover SELECT, creating
-- two permissive SELECT policies when a separate public-read policy already
-- exists.  Fix: replace FOR ALL with INSERT + UPDATE + DELETE only.
--
-- Special cases:
--   editorial tables  — staff need to read unpublished content, so the public
--                       SELECT is merged into one policy with an OR condition.
--   profile_comments  — two DELETE policies merged into one.
--   discover_search_events — staff read + staff manage (FOR ALL) collapsed;
--                            INSERT stays with "Anyone can insert".
--
-- All (select public.is_staff_user()) calls are wrapped in a subselect to
-- prevent per-row re-evaluation.

-- ============================================================
-- catalog tables: public read (true) already exists —
-- staff only need INSERT / UPDATE / DELETE.
-- ============================================================

-- canonical_titles
drop policy if exists "Staff can manage canonical titles" on public.canonical_titles;
create policy "Staff can manage canonical titles"
on public.canonical_titles for insert
with check ((select public.is_staff_user()));

create policy "Staff can update canonical titles"
on public.canonical_titles for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete canonical titles"
on public.canonical_titles for delete
using ((select public.is_staff_user()));

-- title_aliases
drop policy if exists "Staff can manage title aliases" on public.title_aliases;
create policy "Staff can manage title aliases"
on public.title_aliases for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title aliases"
on public.title_aliases for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title aliases"
on public.title_aliases for delete
using ((select public.is_staff_user()));

-- title_genres
drop policy if exists "Staff can manage title genres" on public.title_genres;
create policy "Staff can manage title genres"
on public.title_genres for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title genres"
on public.title_genres for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title genres"
on public.title_genres for delete
using ((select public.is_staff_user()));

-- title_tags
drop policy if exists "Staff can manage title tags" on public.title_tags;
create policy "Staff can manage title tags"
on public.title_tags for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title tags"
on public.title_tags for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title tags"
on public.title_tags for delete
using ((select public.is_staff_user()));

-- title_moods
drop policy if exists "Staff can manage title moods" on public.title_moods;
create policy "Staff can manage title moods"
on public.title_moods for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title moods"
on public.title_moods for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title moods"
on public.title_moods for delete
using ((select public.is_staff_user()));

-- title_availability
drop policy if exists "Staff can manage title availability" on public.title_availability;
create policy "Staff can manage title availability"
on public.title_availability for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title availability"
on public.title_availability for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title availability"
on public.title_availability for delete
using ((select public.is_staff_user()));

-- title_source_refs
drop policy if exists "Staff can manage title source refs" on public.title_source_refs;
create policy "Staff can manage title source refs"
on public.title_source_refs for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title source refs"
on public.title_source_refs for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title source refs"
on public.title_source_refs for delete
using ((select public.is_staff_user()));

-- title_relations
drop policy if exists "Staff can manage title relations" on public.title_relations;
create policy "Staff can manage title relations"
on public.title_relations for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title relations"
on public.title_relations for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title relations"
on public.title_relations for delete
using ((select public.is_staff_user()));

-- title_studios (created in 20260327060000)
drop policy if exists "Staff can manage title studios" on public.title_studios;
create policy "Staff can manage title studios"
on public.title_studios for insert
with check ((select public.is_staff_user()));

create policy "Staff can update title studios"
on public.title_studios for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete title studios"
on public.title_studios for delete
using ((select public.is_staff_user()));

-- ============================================================
-- editorial tables: staff need to read ALL rows (including drafts),
-- so merge public + staff SELECT into a single policy, then add
-- staff write as INSERT + UPDATE + DELETE.
-- ============================================================

-- editor_collections
drop policy if exists "Public can read published collections" on public.editor_collections;
drop policy if exists "Staff can manage collections" on public.editor_collections;

create policy "Read editor collections"
on public.editor_collections for select
using (
  (select public.is_staff_user())
  or (
    visibility = 'public'
    and status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
);

create policy "Staff can write collections"
on public.editor_collections for insert
with check ((select public.is_staff_user()));

create policy "Staff can update collections"
on public.editor_collections for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete collections"
on public.editor_collections for delete
using ((select public.is_staff_user()));

-- editor_collection_items
drop policy if exists "Public can read published collection items" on public.editor_collection_items;
drop policy if exists "Staff can manage collection items" on public.editor_collection_items;

create policy "Read editor collection items"
on public.editor_collection_items for select
using (
  (select public.is_staff_user())
  or exists (
    select 1
    from public.editor_collections c
    where c.id = editor_collection_items.collection_id
      and c.visibility = 'public'
      and c.status = 'published'
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at >= now())
  )
);

create policy "Staff can write collection items"
on public.editor_collection_items for insert
with check ((select public.is_staff_user()));

create policy "Staff can update collection items"
on public.editor_collection_items for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete collection items"
on public.editor_collection_items for delete
using ((select public.is_staff_user()));

-- homepage_content_blocks
drop policy if exists "Public can read published homepage blocks" on public.homepage_content_blocks;
drop policy if exists "Staff can manage homepage blocks" on public.homepage_content_blocks;

create policy "Read homepage content blocks"
on public.homepage_content_blocks for select
using (
  (select public.is_staff_user())
  or (
    visibility = 'public'
    and status = 'published'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
);

create policy "Staff can write homepage blocks"
on public.homepage_content_blocks for insert
with check ((select public.is_staff_user()));

create policy "Staff can update homepage blocks"
on public.homepage_content_blocks for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete homepage blocks"
on public.homepage_content_blocks for delete
using ((select public.is_staff_user()));

-- ============================================================
-- battle_public_decks: public read SELECT (true) already exists,
-- user manage FOR ALL → INSERT + UPDATE + DELETE only.
-- ============================================================
drop policy if exists "Users can manage own battle public decks" on public.battle_public_decks;

create policy "Users can insert own battle public decks"
on public.battle_public_decks for insert
with check ((select auth.uid()) = owner_user_id);

create policy "Users can update own battle public decks"
on public.battle_public_decks for update
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Users can delete own battle public decks"
on public.battle_public_decks for delete
using ((select auth.uid()) = owner_user_id);

-- ============================================================
-- discover_search_events:
-- "Staff can read" (SELECT) + "Staff can manage" (FOR ALL) → 2 SELECT for staff.
-- "Anyone can insert" (INSERT) + "Staff can manage" (FOR ALL) → 2 INSERT for staff.
-- Fix: drop both staff policies, recreate as SELECT + UPDATE + DELETE only.
-- INSERT for staff is already covered by "Anyone can insert" (to anon, authenticated).
-- ============================================================
drop policy if exists "Staff can read discover search events" on public.discover_search_events;
drop policy if exists "Staff can manage discover search events" on public.discover_search_events;

create policy "Staff can manage discover search events"
on public.discover_search_events for select
using ((select public.is_staff_user()));

create policy "Staff can update discover search events"
on public.discover_search_events for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "Staff can delete discover search events"
on public.discover_search_events for delete
using ((select public.is_staff_user()));

-- ============================================================
-- profile_comments: merge two overlapping DELETE policies into one.
-- ============================================================
drop policy if exists "Comment author can delete own comment" on public.profile_comments;
drop policy if exists "Profile owner can moderate comments" on public.profile_comments;

create policy "Comment author or profile owner can delete comment"
on public.profile_comments for delete
using (
  (select auth.uid()) = author_user_id
  or (select auth.uid()) = profile_user_id
);
