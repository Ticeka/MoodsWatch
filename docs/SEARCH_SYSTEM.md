# Search System — Production Guide

> **Scope:** Autocomplete, full-text search, ranking, analytics, recovery, and the admin search dashboard.
> **Last updated:** 2026-03-22

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Flow](#2-data-flow)
3. [Ranking Rules](#3-ranking-rules)
4. [How to Tune Weights](#4-how-to-tune-weights)
5. [Recovery Flow ("Did you mean?")](#5-recovery-flow-did-you-mean)
6. [Analytics Events](#6-analytics-events)
7. [Rollout Plan](#7-rollout-plan)
8. [Monitoring After Launch](#8-monitoring-after-launch)
9. [Rollback Paths](#9-rollback-paths)
10. [Product Iteration Roadmap](#10-product-iteration-roadmap)
11. [Admin Guide](#11-admin-guide)

---

## 1. Architecture Overview

```
User types query
       │
       ▼
┌──────────────────────────────────────────────────┐
│  useSearchAutocomplete (hook)                    │
│  src/features/discover/hooks/useSearchAutocomplete.js │
│                                                  │
│  surface: 'header' | 'discover' | 'commandpalette' │
│  220ms debounce → expandQuery() → fetch parallel  │
└──────┬───────────────┬───────────────┬───────────┘
       │               │               │
  listTitles()   searchPosts()   searchProfiles()   searchTierlists()
  (recommend.js) (entitySearch.js)                  (entitySearch.js)
       │               │
  Module-level    withCacheDedup()
  catalog cache   60s TTL + in-flight Map
  (15 min TTL)    (prevents duplicate DB calls
                   when header + discover mount
                   simultaneously)
       │
  scoreSearchCandidates() — getCachedScore()
  (searchMatch.js)          clears per query,
                            shared across surfaces
       │
  toGroupedSuggestions()
  → _groupResultCache (3 min TTL, keyed by "query:surface")
       │
  flattenSuggestionGroups() → sortSuggestionItems()
       │
  SearchAutocomplete UI  /  <link rel="prefetch"> top 3 hrefs
```

### Key files

| File | Responsibility |
|------|---------------|
| `hooks/useSearchAutocomplete.js` | Orchestrates fetch, cache, debounce, scoring, prefetch |
| `lib/searchMatch.js` | Tokenisation, fuzzy scoring (Damerau-Levenshtein), intent detection |
| `lib/searchSynonyms.js` | Abbreviation / typo / genre synonym expansion |
| `lib/recommend.js` | Catalog fetch + module-level cache |
| `lib/entitySearch.js` | Posts, profiles, tierlists fetch + 60s TTL cache |
| `lib/autocompleteFeedback.js` | Per-user click boost stored in localStorage |
| `lib/discoverAnalytics.js` | Fire-and-forget insert to `discover_search_events` |
| `lib/discoverSearchState.js` | Recent searches + saved searches (localStorage) |
| `components/ui/SearchAutocomplete.jsx` | Pure display component (groups, highlights, remove) |
| `components/ui/CommandPalette.jsx` | Keyboard-first overlay, ⌘K / Ctrl+K |

### Surfaces

| Surface key | Where mounted | Group caps |
|-------------|--------------|------------|
| `header` | `Header.jsx` — inline bar | recent:3 titles:3 people:2 posts:2 tierlists:2 |
| `discover` | `Discover.jsx` — full-page bar | recent:4 titles:4 people:3 posts:3 tierlists:3 |
| `commandpalette` | `CommandPalette.jsx` — ⌘K overlay | (inherits header config) |

---

## 2. Data Flow

### Step-by-step for a query `"jjk"`

1. User types `"jjk"` → hook receives `query = "jjk"`.
2. **expandQuery** maps `"jjk"` → `"jujutsu kaisen"` (ABBREVIATION_MAP in `searchSynonyms.js`).
   `normalizedQuery = "jjk"` (for display), `searchQuery = "jujutsu kaisen"` (for fetch/rank).
3. After 220ms debounce, check **_groupResultCache** — if hit, return immediately.
4. Fire four parallel fetches using `searchQuery`:
   - `listTitles({ query: "jujutsu kaisen", pageSize: 4 })` — returns from catalog cache (15 min TTL)
   - `searchPosts(...)` — `withCacheDedup` returns cached/in-flight promise
   - `searchProfiles(...)` — same
   - `searchTierlists(...)` — tierlists loaded per userId once (2 min TTL)
5. **toGroupedSuggestions** builds suggestion objects per surface config.
6. Store result in **_groupResultCache** keyed `"jujutsu kaisen:header"`.
7. **sortSuggestionItems** runs `getCachedScore(query, item)` per item.
   Scores are cached in `_scoreCache` (cleared on query change), shared across surfaces.
8. **flattenSuggestionGroups** assigns `flatIndex` for keyboard nav.
9. After loading settles, inject `<link rel="prefetch">` for top 3 hrefs.
10. **recordAutocompleteSelection** fires on click → updates localStorage boost.

### Query expansion priority

```
TYPO_MAP > ABBREVIATION_MAP > SYNONYM_MAP
```
Exact phrase wins over token-level expansion.

---

## 3. Ranking Rules

All ranking happens client-side in `sortSuggestionItems`. Final score formula:

```
finalScore = (lexicalScore × broadMultiplier)
           + clickBoost
           + freshnessBonus      (posts only, up to +14 pts, decays over 7 days)
           + popularityBonus     (titles only, up to +8 pts, log-capped)
           + exactMatchBonus     (title === query → +600 pts)
```

### Lexical score (`scoreSearchCandidates`)

Iterates over a title's `rankingCandidates` array. Each candidate has a **weight** and list of texts.

Per-text match tiers (default weights in `resolveMatchWeights`):

| Match type | Points |
|-----------|--------|
| Exact phrase | 180 |
| Phrase prefix | 120 |
| Phrase contains | 80 |
| Exact token | 70 |
| Word boundary | 42 |
| Token prefix | 30 |
| Token contains | 16 |
| Typo (distance 1) | 14 |
| Typo (distance 2) | ~8 |

Best score across all texts in a candidate × candidate weight = candidate contribution.
Sum across all candidates = total lexical score.

### Field weights per entity type

**Titles** (language-aware):
```
Thai script texts:   weight 5.8 (latin query) → 3.4 (thai query)
Latin script texts:  weight 5.8 (latin query) → 3.4 (thai query)
Type/genres/moods:   weight 1.8
Popularity bonus:    √popularity × 0.4 (capped at 8)
```

**Profiles:**
```
username, name:      weight 4.7
bio, favorite_moods: weight 1.6
```

**Posts:**
```
content, title name: weight 4.1
author fields:       weight 2.4
Freshness bonus:     max(0, 14 - ageDays × 2)
```

**Tierlists:**
```
title:               weight 4.4
owner, kind:         weight 1.9
description:         weight 1.2
```

### Click boost (`getAutocompleteSelectionBoost`)

Stored in `localStorage` key `moodswatch-autocomplete-feedback`:
```
boost = (query-specific click count × 40) + (global click count × 10)
```
Capped at 55% of the item's own lexical score, so a heavily-clicked stale result
can't override a clearly better new match.

### Broad query detection

If the query matches `BROAD_DISCOVER_TERMS` (genres, moods, common words), items
with lexical score < 80 are dampened by ×0.55 to reduce noise.

---

## 4. How to Tune Weights

### Changing match tier weights

Edit `resolveMatchWeights()` in `src/features/discover/lib/searchMatch.js`:

```js
function resolveMatchWeights(matchWeights = {}) {
  return {
    exactPhrase: 180,   // ← increase to make exact matches dominate even more
    prefixPhrase: 120,
    containsPhrase: 80,
    exactToken: 70,
    wordBoundary: 42,
    prefixToken: 30,
    containsToken: 16,
    typoToken: 14,      // ← decrease if fuzzy matches feel too loose
    ...matchWeights,
  };
}
```

Individual candidates can override weights via `matchWeights` property on the candidate object.

### Changing field weights per entity

In `useSearchAutocomplete.js`, find `buildTitleSuggestion / buildProfileSuggestion / buildPostSuggestion / buildTierlistSuggestion`.
Adjust the `weight` property of each `rankingCandidates` entry.

**Rule of thumb:**
- Doubling a weight doubles that field's contribution relative to others.
- Title-name weights (~5.8) should stay 3–6× higher than metadata weights (genre, mood ~1.8).
- Never set a field weight to 0 — remove the candidate entirely instead.

### Changing freshness / popularity bonuses

```js
// In buildPostSuggestion — decay rate
const freshnessBonus = ageMs !== null
  ? Math.max(0, 14 - (ageMs / (24 * 3600 * 1000)) * 2)  // ← change 14 (max) or 2 (decay/day)
  : 0;

// In buildTitleSuggestion — popularity cap
const popularityBonus = Math.min(8, Math.sqrt(title?.popularity || 0) * 0.4);
//                             ^^^  ← change cap      ^^^^^^^^^^^  ← change multiplier
```

### Changing click boost strength

In `autocompleteFeedback.js`:
```js
return (queryCount * 40) + (globalCount * 10);
//                   ^^                   ^^
// query-specific boost     global boost
```
And in `useSearchAutocomplete.js`, the cap:
```js
Math.min(rawLeftBoost, leftLexical * 0.55)
//                                   ^^^^ ← max fraction of lexical score the boost can add
```

### Tuning the synonym / abbreviation maps

Add entries to `searchSynonyms.js`. All keys must be lowercase, single-spaced.
- New abbreviations → `ABBREVIATION_MAP`
- Common typos → `TYPO_MAP`
- Genre/mood shorthand → `SYNONYM_MAP`

After adding: clear `_groupResultCache` won't happen automatically in prod (it's in-memory).
Cache expires in 3 min, or user can hard-refresh.

---

## 5. Recovery Flow ("Did you mean?")

Triggered when: query ≥ 3 chars AND all live groups return empty AND loading is done.

```
normalizedQuery ≥ 3 chars
AND liveGroups.length === 0
AND !isLoading
        │
        ▼
Build recoveryCandidates: Set([searchQuery, firstToken, lastToken])
        │
        ▼
240ms debounce → Promise.allSettled(
  candidates.map(term => listTitles({ query: term, pageSize: 5 }))
)
        │
        ▼
Deduplicate by display name → take first 4
        │
        ▼
Render as "recovery" chip group in autocomplete
        │
        ▼
User clicks chip → trackDiscoverEvent('recovery_apply')
                → navigate to /discover?q=<expanded>
```

Recovery uses `listTitles` only (not posts/profiles) because titles have the most stable
canonical names and best catalog coverage.

---

## 6. Analytics Events

All events go to `discover_search_events` table via `trackDiscoverEvent()` in `discoverAnalytics.js`.
The function is fire-and-forget — errors are swallowed silently (never blocks UI).

### Event reference

| Event type | Fired when | Key fields |
|-----------|-----------|-----------|
| `search_view` | Discover page mounts with a query | `query`, `scope`, `title_type`, `tag` |
| `search_submit` | User presses Enter or clicks "Search for X" | `query`, `surface` in metadata |
| `search_abandon` | Autocomplete closes without selection (query ≥ 2 chars) | `query`, `surface`, `query_length` |
| `no_results_view` | Search completes, all lanes empty | `query`, `surface`, `query_length` |
| `autocomplete_select` | User clicks a suggestion | `query`, `result_type`, `result_id`, `result_rank`, `surface` |
| `preset_apply` | User picks a mood/genre preset chip | `preset_source`, `tag`, `scope` |
| `result_click` | User clicks a result card on the full Discover page | `result_type`, `result_id`, `result_rank` |
| `recovery_apply` | User clicks a "Did you mean?" chip | `query`, `surface` |
| `saved_search_create` | User saves a search | `query`, `scope`, `title_type`, `tag` |
| `saved_search_update` | User edits/pins a saved search | `query` |
| `saved_search_delete` | User deletes a saved search | `query` |

### Session tracking

Each browser tab gets a UUID in `sessionStorage` (`moodswatch-discover-session-id`).
This allows funnel queries like "search_abandon rate per session" without requiring auth.

### Adding a new event

1. Add the type string to `DISCOVER_EVENT_TYPE_SET` in `discoverAnalytics.js`.
2. Add it to the `check` constraint in a new Supabase migration:
   ```sql
   alter table public.discover_search_events
     drop constraint if exists discover_search_events_event_type_check;
   alter table public.discover_search_events
     add constraint discover_search_events_event_type_check
       check (event_type in (..., 'your_new_event'));
   ```
3. Call `trackDiscoverEvent({ eventType: 'your_new_event', ... })` in the component.

---

## 7. Rollout Plan

The search system has no runtime feature flags — it ships as-is. Use the checklist
below before merging to production.

### Pre-launch checklist

- [ ] Run all migrations in order (see `supabase/migrations/2026032*.sql`)
- [ ] Verify `20260322010000_fix_search_event_types_and_kpi_indexes.sql` applied
      (old constraint rejected 6 event types — they were silently dropped)
- [ ] Smoke-test autocomplete on mobile (drawer surface) + desktop (header)
- [ ] Smoke-test ⌘K / Ctrl+K command palette
- [ ] Verify `discover_search_events` is receiving rows (check Supabase table viewer)
- [ ] Confirm `is_staff_user()` function exists (required for analytics RLS SELECT policy)
- [ ] Confirm `user_discover_saved_searches` table exists and RLS is active

### Phased enablement (if you want to gate features)

Since there are no code-level flags, you can gate by user role in Supabase RLS:

**Option A — analytics only for staff first:**
Already done. Only staff can SELECT from `discover_search_events`.
Anonymous + authenticated users can INSERT only.

**Option B — saved searches behind auth:**
Already scoped: `user_discover_saved_searches` requires `auth.uid() = user_id`.
Anon users see the UI but saves are rejected without sign-in.

**Option C — disable recovery flow without a deploy:**
The recovery fetch only fires when `liveGroups.length === 0`.
You cannot turn it off at runtime without a flag. If needed, add:
```js
const RECOVERY_ENABLED = true; // ← set to false to kill it
```
at the top of `useSearchAutocomplete.js` and gate the recovery `useEffect`.

---

## 8. Monitoring After Launch

### KPI queries (run in Supabase SQL editor)

**1. Zero-result rate (last 7 days)**
```sql
select
  count(*) filter (where event_type = 'no_results_view') as zero_result_count,
  count(*) filter (where event_type = 'search_submit')   as total_submits,
  round(
    100.0 * count(*) filter (where event_type = 'no_results_view')
          / nullif(count(*) filter (where event_type = 'search_submit'), 0),
    1
  ) as zero_result_rate_pct
from discover_search_events
where created_at >= now() - interval '7 days';
```
**Target:** < 15%.  Alert if > 25% — likely a catalog or scoring regression.

**2. Autocomplete CTR**
```sql
select
  count(*) filter (where event_type = 'autocomplete_select') as clicks,
  count(*) filter (where event_type = 'search_submit')       as submits,
  round(
    100.0 * count(*) filter (where event_type = 'autocomplete_select')
          / nullif(count(*) filter (where event_type in ('search_submit','search_abandon')), 0),
    1
  ) as autocomplete_ctr_pct
from discover_search_events
where created_at >= now() - interval '7 days';
```
**Target:** > 40%.  If < 20%, ranking is likely returning irrelevant top results.

**3. Abandon rate**
```sql
select
  count(*) filter (where event_type = 'search_abandon') as abandons,
  count(*) filter (where event_type in ('search_submit','autocomplete_select','search_abandon')) as total_sessions,
  round(
    100.0 * count(*) filter (where event_type = 'search_abandon')
          / nullif(count(*) filter (where event_type in ('search_submit','autocomplete_select','search_abandon')), 0),
    1
  ) as abandon_rate_pct
from discover_search_events
where created_at >= now() - interval '7 days';
```

**4. Top zero-result queries**
```sql
select normalized_query, count(*) as hits
from discover_search_events
where event_type = 'no_results_view'
  and created_at >= now() - interval '7 days'
  and normalized_query <> ''
group by normalized_query
order by hits desc
limit 20;
```
Use this list to add entries to `TYPO_MAP` or `ABBREVIATION_MAP`.

**5. Recovery success rate**
```sql
with recovery_sessions as (
  select session_id
  from discover_search_events
  where event_type = 'no_results_view'
    and created_at >= now() - interval '7 days'
)
select
  count(distinct r.session_id) as recovery_exposed,
  count(distinct case when e.event_type = 'recovery_apply' then e.session_id end) as recovery_used,
  round(
    100.0 * count(distinct case when e.event_type = 'recovery_apply' then e.session_id end)
          / nullif(count(distinct r.session_id), 0),
    1
  ) as recovery_use_rate_pct
from recovery_sessions r
left join discover_search_events e using (session_id);
```

**6. Error rate for analytics inserts**
Supabase does not surface insert errors to the client (they're swallowed). Instead, compare:
```sql
-- Should be non-zero within minutes of any user activity
select count(*), date_trunc('hour', created_at) as hour
from discover_search_events
where created_at >= now() - interval '24 hours'
group by hour
order by hour desc;
```
If rows stop appearing while the app is getting traffic → check `missingAnalyticsTable`
flag in browser console (it will warn once if the table is missing or RLS is blocking inserts).

---

## 9. Rollback Paths

### Ranking regression

Ranking is 100% client-side and stateless. To roll back:

1. **Immediate (no deploy):** Not possible — weights are compiled into the bundle.
2. **Fast deploy rollback:** `git revert` the weight-change commit, push, wait for CDN.
3. **Kill click boost only:** Set the cap multiplier to 0:
   ```js
   // useSearchAutocomplete.js — sortSuggestionItems
   const leftBoost = 0;
   const rightBoost = 0;
   ```
   This disables behavioral re-ranking without touching lexical scoring.

### Analytics regression

If analytics inserts cause latency or errors visible to users:

1. Set `missingAnalyticsTable = true` manually in a hotfix — this silences all inserts for
   the current page load. Not persistent across reloads.
2. **Proper fix:** drop or alter the check constraint in Supabase if a bad event_type
   was added, or disable the INSERT policy temporarily.
3. **Nuclear:** Rename the table. `isMissingTableError()` will detect the missing table
   name and set the module-level flag, cutting off all future inserts silently.

### Synonym / abbreviation regression

If an expansion mapping causes wrong results (e.g., "mob" → "mob psycho 100" breaks
unrelated searches):

1. Remove the key from the appropriate map in `searchSynonyms.js`.
2. Deploy. The `_groupResultCache` and `_scoreCache` are in-memory and clear on refresh.

### Recovery flow regression

If recovery chips surface confusing or wrong suggestions:

1. Set `liveGroups.length > 0` check will naturally suppress it for most queries.
2. To fully disable without a deploy: add an early return to the recovery `useEffect`
   (`if (true) return;`). Short-circuit and deploy.

---

## 10. Product Iteration Roadmap

### A/B test — ranking variants

The cleanest A/B is to vary field weights by user cohort. Suggested approach:

1. Add a `searchVariant` prop to `useSearchAutocomplete` (values: `'control' | 'v1'`).
2. Assign variant by `userId % 2 === 0` (stable per user, no server needed).
3. Pass different weight overrides per variant to `buildTitleSuggestion`.
4. Track variant in `metadata` field of every analytics event:
   ```js
   metadata: { surface, variant: searchVariant }
   ```
5. Compare CTR and zero-result rate per variant in the KPI queries above,
   adding `where metadata->>'variant' = 'v1'`.

**Variants worth testing:**
- Boost `exactPhrase` from 180 → 240 (hypothesis: exact title name queries improve)
- Lower `typoToken` from 14 → 8 (hypothesis: fewer false fuzzy positives)
- Raise `popularityBonus` cap from 8 → 16 (hypothesis: popular titles surface better)

### Command palette adoption

Current state: ⌘K / Ctrl+K opens `CommandPalette.jsx`.
Track adoption with:
```js
trackDiscoverEvent({ eventType: 'search_view', metadata: { surface: 'commandpalette' } });
```
Then query:
```sql
select metadata->>'surface' as surface, count(*)
from discover_search_events
where event_type = 'search_view'
  and created_at >= now() - interval '7 days'
group by surface;
```
If `commandpalette` share < 5% after 2 weeks, add a discoverability hint
(tooltip on the search bar, or keyboard shortcut badge).

### Saved searches iteration

Current: users can save up to 8 searches, pin, reorder.

Next steps to consider:
- **"Save this search" prompt** — after `search_submit` with ≥ 3 results, show a
  one-time inline prompt "Save this search?" (dismiss → don't show again for 14 days).
- **Sync to server** — `user_discover_saved_searches` table is already in the DB.
  Currently saved searches are localStorage-only. Add a Supabase sync pass to make
  them device-portable.
- **Smart labels** — auto-generate label from query + scope rather than requiring user input.

### Related searches / suggested intents

Not yet implemented. Approach:

1. After a `result_click` event, query for the top 5 `normalized_query` values that
   also led to clicks on the same `result_id`:
   ```sql
   select normalized_query, count(*) as co_clicks
   from discover_search_events
   where event_type = 'result_click'
     and result_id = '<title_id>'
   group by normalized_query
   order by co_clicks desc
   limit 5;
   ```
2. Surface these as "others also searched" chips below the result.
3. Alternatively: embed the top co-queries per title into the catalog JSON at build time
   (static, zero-latency).

### Suggested intents / smart prompts

When the search bar is empty (idle mode), show context-aware chips:
- Recent searches (already shown)
- "Popular this week" — query `discover_search_events` for top `normalized_query`
  by `result_click` count in last 7 days (staff can run this and seed a static file)
- Mood-based prompts — surface 3 moods from the user's `favorite_moods` profile field

---

## 11. Admin Guide

### Viewing search analytics

Go to `/admin/analytics` → **Search** tab (if implemented) or use the KPI queries
in [Section 8](#8-monitoring-after-launch) directly in the Supabase SQL editor.

Staff role required (`role = 'admin' | 'editor'`). RLS blocks non-staff reads.

### Finding and fixing zero-result queries

1. Run the **Top zero-result queries** KPI query (Section 8, query #4).
2. For each query, try it in the Discover search bar yourself.
3. If it's a typo → add to `TYPO_MAP` in `searchSynonyms.js`.
4. If it's an abbreviation → add to `ABBREVIATION_MAP`.
5. If it's a genre/mood shorthand → add to `SYNONYM_MAP`.
6. If the title genuinely doesn't exist → add to catalog via `/admin/titles`.
7. Deploy the synonym change — no migration needed.

### Tuning weights after launch

Use the KPI queries to identify where ranking is weak:
- **High zero-result rate for specific query type** → add synonym entry.
- **Low CTR but non-zero results** → top result is wrong; check field weights for that entity type.
- **High abandon rate on mobile** → may be a UX issue (caps, scroll) not a ranking issue.

Only change weights when you have ≥ 500 events for the affected query pattern.
Small samples produce noisy conclusions.

### Adding a new synonym

```js
// src/features/discover/lib/searchSynonyms.js

// ── Abbreviations ─────
const ABBREVIATION_MAP = {
  // ...existing entries...
  'yyh': 'yu yu hakusho',   // ← new entry
};
```

Rules:
- Key: lowercase, single space between words, no punctuation.
- Value: canonical form as it appears in the catalog (use `title_en` or `title_romaji`).
- Test locally: open browser console, call `expandQuery('yyh')` — should return `'yu yu hakusho'`.

### Checking if analytics is working

In the browser console on Discover or after a search:
```
// No errors → analytics is live
// "Discover analytics tracking failed" → check Supabase RLS or constraint
```

In Supabase:
```sql
select * from discover_search_events order by created_at desc limit 5;
```
Should show rows within seconds of any search activity.

### Saved searches table

`user_discover_saved_searches` — one row per saved search per user.
Fields: `label`, `query`, `scope`, `title_type`, `tag`, `pinned`, `position`.

To inspect a user's saved searches:
```sql
select * from user_discover_saved_searches
where user_id = '<user_uuid>'
order by pinned desc, position asc;
```

To clear a corrupted saved search:
```sql
delete from user_discover_saved_searches
where id = '<row_uuid>';
```
