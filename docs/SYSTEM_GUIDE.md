# MoodToon System Guide

This document describes the current system as it exists in the repository today, including the phase breakdown, user flows, admin workflows, database model, scripts, and day-to-day usage.

## 1. System Overview

MoodToon is a React + Vite application backed by Supabase. It combines:

- public catalog discovery and title detail pages
- authenticated user profile and watchlist management
- recommendation logic based on catalog metadata and profile preferences
- admin/back-office tooling for editorial curation and moderation

Primary route map:

- `/` Home
- `/discover`
- `/title/:slug`
- `/battle`
- `/battle/:sessionId`
- `/watchlist`
- `/profile`
- `/login`
- `/admin/*`

Admin route map:

- `/admin` dashboard
- `/admin/titles`
- `/admin/titles/:id`
- `/admin/moods`
- `/admin/users`
- `/admin/analytics`
- `/admin/reports`
- `/admin/duplicates`
- `/admin/collections`
- `/admin/homepage`
- `/admin/recommendations`

Role protection:

- regular user flows are available publicly except profile-related pages
- `/profile` requires authentication
- `/admin/*` requires `admin` or `editor` role through `ProtectedRoute`

## 2. Phase Breakdown

The current repository can be understood as three delivered phases plus one planned phase.

### Phase 1: Catalog Foundation

Main objective:

- replace loose title handling with a canonical catalog in Supabase

Delivered capabilities:

- canonical catalog schema
- title aliases, source refs, genres, tags, relations, availability, moods
- multi-source ingestion scripts (AniList, Jikan, optional PornhwaDB)
- catalog-backed home, discover, title detail, and admin title management

Core migrations:

- `20260314000000_canonical_catalog.sql`
- `20260314230500_catalog_compat.sql`

Core scripts:

- `npm run catalog:ingest:anilist`
- `npm run catalog:ingest:jikan`
- `npm run catalog:ingest:pornhwadb`
- `npm run catalog:ingest:all`
- `npm run catalog:resume:all`
- `npm run catalog:dedupe`

### Phase 2: Personalization Layer

Main objective:

- make the product user-centric with stateful profile, watchlist, preference, and recommendation flows

Delivered capabilities:

- authenticated user profiles
- watchlist synced to Supabase with local fallback
- title history
- hidden titles and hidden scopes
- recommendation preference controls
- consumption sessions
- top titles per type on profile
- battle sessions and vote persistence for authenticated users, with local fallback

Core migrations:

- `20260315000000_profile_preferences_history.sql`
- `20260315010000_hidden_titles.sql`
- `20260315020000_recommendation_controls.sql`
- `20260315030000_user_lists_phase2_and_pref_filters.sql`
- `20260315040000_hidden_title_scopes.sql`
- `20260315050000_user_consumption_sessions.sql`
- `20260315060000_profile_top_titles.sql`
- `20260316020000_battle_persistence.sql`

### Phase 3: Editorial + Moderation + Admin Workflow

Main objective:

- move from a catalog app to an operational platform with editorial control and moderation workflows

Delivered capabilities:

- editor collections
- homepage content blocks and live homepage wiring
- admin recommendation preview with explainability
- improved admin titles listing with search/filter/pagination
- content reports workflow
- duplicate review and merge workflow
- analytics expansion across catalog, editorial, reports, and duplicates
- hardening pass for admin pages

Core migrations:

- `20260315180000_phase3_editorial_surfaces.sql`
- `20260315200000_phase3_content_reports.sql`
- `20260315210000_phase3_duplicate_handling.sql`
- `20260316010000_phase3_duplicate_merge_hardening.sql`

Still intentionally not built:

- external link monitoring / health checks

### Phase 4: Business + Intelligence (Planned)

Main objective:

- extend the product from personalization and editorial operations into monetization, partner distribution, and recommendation intelligence without degrading user trust

Planned capabilities:

- affiliate layers with partner links, attribution, click logging, and disclosure-ready UI
- sponsored campaigns built on top of existing editorial collections and homepage blocks
- advanced personalization using richer behavioral signals, recent intent, and audience segmentation
- imports from external lists such as AniList, MyAnimeList, and CSV exports
- yearly recap generated from watchlist, history, sessions, moods, and favorites
- deeper recommendation fatigue prevention with cooldowns, diversity rules, and impression-aware ranking

Platform prerequisites:

- impression and outbound-click event tracking across Home, Discover, Title Detail, and campaign surfaces
- campaign and affiliate attribution schema that can tie placements to a partner, sponsor, and reporting window
- asynchronous job support for imports, recap generation, and backfills
- stronger recommendation telemetry so ranking can observe repeats, skips, hides, and return behavior

Suggested delivery order:

1. Tracking foundation
2. Affiliate primitives
3. Sponsored campaign workflow
4. Recommendation fatigue controls
5. Advanced personalization expansion
6. External list import flow
7. Yearly recap generation and share surfaces

Suggested implementation slices:

- Slice 4A: add event instrumentation, impression logs, outbound click logs, and admin analytics expansion first because every other phase 4 feature depends on reliable telemetry
- Slice 4B: add affiliate links and sponsored campaigns next because they unlock business value fastest and reuse the existing editorial/admin system
- Slice 4C: add fatigue prevention before heavier personalization so monetized placements do not cause visible repetition or quality regression
- Slice 4D: add advanced personalization after telemetry exists so new ranking features can be evaluated against real user behavior
- Slice 4E: add external list import after mapping and duplicate safety rules are in place because bad imports can pollute personalization state
- Slice 4F: add yearly recap last because it depends on the quality and completeness of the behavioral history built earlier

Phase 4 success metrics:

- affiliate click-through rate and partner conversion import coverage
- sponsored campaign fill rate, CTR, and disclosure compliance
- recommendation repeat-impression rate, hide rate, and session depth
- import success rate, title match confidence, and rollback rate
- yearly recap open rate and share rate

## 3. User-Facing Features

### 3.1 Home

Purpose:

- show curated and dynamic content surfaces

Current behavior:

- reads canonical titles from Supabase
- renders editorial homepage blocks when configured
- falls back to built-in sections where appropriate
- supports hero, collection, continue, trending, and recommendation-based surfaces

### 3.2 Discover

Purpose:

- browse and filter the catalog

Current behavior:

- uses `canonical_titles`
- supports type filtering, query filtering, mood-driven discovery, and recommendation hooks
- caches catalog data client-side for a short TTL

### 3.3 Title Detail

Purpose:

- show a canonical title page and act as the main user action surface

Current behavior:

- displays aliases, metadata, platforms, and catalog-driven detail
- allows watchlist actions
- allows top-title actions
- allows authenticated users to submit a content report

### 3.4 Watchlist

Purpose:

- track titles and personal progress

Current behavior:

- syncs with `user_lists`
- records history in `user_title_history`
- records progress sessions in `user_consumption_sessions`
- supports episode/chapter-based progress logic

### 3.5 Battle

Purpose:

- create solo title-versus-title ranking sessions from the live catalog

Current behavior:

- supports `/battle` hub and `/battle/:sessionId` play/result routes
- builds deterministic decks from the live visible catalog
- respects hidden titles and adult-content profile filtering before deck creation
- stores recent sessions locally for offline continuity
- syncs battle sessions and votes to Supabase for authenticated users
- exposes community deck rollups from synced completed runs for matching deck snapshots

### 3.6 Profile

Purpose:

- central place for identity, preferences, hidden titles, history, and profile-level recommendation tuning

Current behavior:

- profile editing and avatar upload
- recommendation type/length/progress filters
- top titles by `anime`, `manga`, `manhwa`
- hidden title management
- recent history and recent consumption sessions

## 4. Recommendation System

Recommendation logic lives mainly in:

- `src/features/discover/lib/recommend.js`
- `src/features/profile/lib/profileStore.js`

Current scoring dimensions include:

- mood match
- genre/tag match
- similar title affinity
- length fit
- popularity
- freshness

Data sources used by recommendation:

- canonical catalog data
- profile preferences
- favorite titles
- hidden titles
- watchlist state

Admin support:

- `/admin/recommendations` can preview recommendation output for a real user persona
- the page exposes debug/explainability fields used during moderation and tuning

## 5. Admin System

### 5.1 Dashboard

Purpose:

- operational entry point for staff

Shows:

- high-level counts
- links into moderation/editorial tools
- public-site cache status

### 5.2 Catalog Titles

Purpose:

- create, edit, search, and remove canonical titles

Key usage:

1. Open `/admin/titles`
2. Search or filter by title/type
3. Open a record
4. Edit canonical fields, aliases, moods, genres, tags, and availability

### 5.3 Editor Collections

Purpose:

- build curated groups of titles for homepage/editorial use

Key usage:

1. Open `/admin/collections`
2. Create a new collection or select an existing one
3. Set slug, name, status, visibility, schedule, and feature flag
4. Add titles as collection items with order and optional note

### 5.4 Homepage Blocks

Purpose:

- map editorial collections and standalone surfaces into the real homepage

Key usage:

1. Open `/admin/homepage`
2. Create a block
3. Choose type, position, status, visibility, and optional linked collection
4. Add CTA/config fields
5. Publish to make the block available on Home

### 5.5 Recommendation Preview

Purpose:

- debug the recommendation engine using a real persona

Key usage:

1. Open `/admin/recommendations`
2. Select a user profile
3. Adjust type, mood, time fit, and result limit
4. Run preview
5. Review reasons and debug scores

### 5.6 Content Reports

Purpose:

- moderate user-submitted content issues

Supported issue types:

- metadata
- broken_link
- wrong_cover
- duplicate
- nsfw
- other

Key usage:

1. User submits a report from title detail
2. Staff opens `/admin/reports`
3. Filter by title, issue type, status, or date
4. Assign to staff, add internal note, and update status
5. Resolve or dismiss when complete

Status model:

- `open`
- `in_review`
- `resolved`
- `dismissed`

### 5.7 Duplicate Handling

Purpose:

- review likely duplicate titles and run safe merges

Key usage:

1. Open `/admin/duplicates`
2. Run heuristic scan when needed
3. Review candidate pair, confidence, and heuristic flags
4. Mark candidate `approved` or `rejected`
5. If approved, choose the canonical title to keep
6. Run merge

Status model:

- `pending`
- `approved`
- `rejected`
- `merged`

Safety notes:

- merge is backed by `admin_merge_duplicate_titles`
- the hardening migration validates candidate existence and approval status
- merge also normalizes affected `duplicate_candidates` pairs to avoid invalid ordering

### 5.8 Analytics

Purpose:

- show backlog and operational health across catalog, editorial, and moderation

Current sections:

- catalog baseline
- editorial analytics
- report analytics
- duplicate analytics

Current filters:

- date range
- editorial status
- homepage block type
- report status
- report issue type
- duplicate status

## 6. Database Model

### 6.1 Catalog Tables

- `canonical_titles`
- `title_aliases`
- `title_source_refs`
- `title_genres`
- `title_tags`
- `title_relations`
- `title_availability`
- `title_moods`
- `moods`

### 6.2 User Tables

- `user_profiles`
- `user_lists`
- `user_favorite_titles`
- `user_hidden_titles`
- `user_title_history`
- `user_consumption_sessions`

### 6.3 Operational Tables

- `catalog_sync_runs`
- `catalog_merge_queue`

### 6.4 Editorial Tables

- `editor_collections`
- `editor_collection_items`
- `homepage_content_blocks`

### 6.5 Moderation Tables

- `content_reports`
- `duplicate_candidates`
- `duplicate_merge_actions`

## 7. RLS and Access Model

High-level access model:

- public can read published editorial surfaces
- authenticated users can manage their own profile/list/history state
- authenticated users can submit content reports
- staff users can manage content reports, duplicate candidates, editorial collections, and homepage blocks

Important note:

- RLS exists at the schema level, but final confidence should still come from testing with real roles against the deployed project

## 8. Setup and Daily Commands

Environment variables:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Recommended daily commands:

```bash
npm install
npm run dev
npm run build
npm test
```

Catalog and admin scripts:

```bash
npm run catalog:ingest:anilist
npm run catalog:ingest:all
npm run catalog:resume:all
npm run catalog:dedupe
npm run db:push
```

Supabase repository config:

- `supabase/config.toml` contains the linked project id

## 9. Verification Status

Local verification currently available:

- `npm test`
  - phase 3 logic checks
  - report mapping/payload checks
  - duplicate heuristic/mapping checks
  - presence of SQL merge hardening guards
- `npm run build`

What still requires manual or real-remote verification:

- RLS behavior by real role
- report submit -> admin review flow
- duplicate approve -> merge flow on deployed DB
- mobile and empty-data smoke tests
- remote migration state inspection using authenticated Supabase CLI

## 10. Known Gaps

Current known gap outside the delivered phases:

- external link monitoring is not implemented yet
- phase 4 monetization and intelligence work is still planned only
- no impression-aware fatigue control exists yet in recommendation ranking
- no external watchlist import pipeline exists yet
- no yearly recap generation flow exists yet

Other practical gaps:

- no full browser E2E suite yet
- bundle size warning still appears during build
- some validation is still operational/manual rather than fully automated

## 11. Proposed Phase 4 Workstreams

### 11.1 Affiliate Layer

Scope summary:

- attach partner destinations to title availability or commerce surfaces
- add affiliate source selection rules by country, platform, and campaign context
- track outbound clicks and optional imported conversion summaries
- expose disclosure labels on user-facing affiliate placements

Likely data additions:

- `affiliate_partners`
- `affiliate_links`
- `affiliate_click_events`
- `affiliate_conversion_imports`

Primary admin surfaces:

- partner management
- link rule management
- affiliate performance analytics

### 11.2 Sponsored Campaigns

Scope summary:

- allow editors/admins to flag collections or homepage blocks as sponsored
- support campaign schedule, budget, targeting, caps, and sponsor metadata
- separate organic recommendation analytics from paid placement analytics

Likely data additions:

- `sponsor_accounts`
- `sponsored_campaigns`
- `campaign_targets`
- `campaign_impression_events`

Primary admin surfaces:

- campaign creation and scheduling
- sponsor disclosure configuration
- sponsor reporting dashboard

### 11.3 Advanced Personalization

Scope summary:

- incorporate recency, repeated engagement, favorite clusters, and session context into ranking
- derive audience segments such as casual, binge, returning, explorer, or mood-loyal users
- distinguish homepage personalization from deeper catalog recommendation intents

Likely data additions:

- `user_behavior_events`
- `user_persona_snapshots`
- `recommendation_impression_events`
- `recommendation_feedback_events`

Primary admin surfaces:

- persona diagnostics
- ranking rule weights
- experimentation and explainability views

### 11.4 External List Imports

Scope summary:

- import user libraries from AniList, MyAnimeList, or CSV
- preview matches before write
- resolve duplicates and conflicts safely
- preserve import history and rollback support

Likely data additions:

- `user_import_jobs`
- `user_import_items`
- `user_import_conflicts`

Primary user/admin surfaces:

- profile import wizard
- conflict resolution review
- import audit trail

### 11.5 Yearly Recap

Scope summary:

- generate annual summary cards from history, sessions, moods, favorites, and completion data
- support both private recap and optional share-ready output
- cache generated recap data so it does not rebuild on every view

Likely data additions:

- `user_yearly_recaps`
- `user_yearly_recap_stats`

Primary user surfaces:

- profile recap entry point
- annual story/cards view

### 11.6 Recommendation Fatigue Prevention

Scope summary:

- log recommendation impressions so repeated exposure can be measured
- apply cooldowns, diversity constraints, and sponsor frequency limits
- downrank titles the user repeatedly ignores while preserving genuine favorites

Likely logic changes:

- impression-aware scoring decay
- per-surface repetition caps
- mood/type diversity floor in result sets
- sponsored placement frequency guardrails

Recommended rollout notes:

- ship behind feature flags
- compare before/after repeat rate and hide rate
- treat fatigue controls as a ranking safety layer, not a separate recommendation system

## 12. Suggested Handoff / Operating Notes

If another engineer needs to continue the system:

1. Read this file first
2. Read `README.md`
3. Run `npm install`, `npm test`, and `npm run build`
4. Check `.env` and Supabase project linkage
5. Review migrations in chronological order if working on data flows
6. Use admin pages, not direct table edits, when validating workflows

## 13. Short "How To Use The System" Summary

For end users:

- browse on Home and Discover
- open a title detail page
- add titles to Watchlist
- manage profile preferences and hidden titles in Profile
- submit reports from title detail when data is wrong

For staff:

- use Admin Dashboard as the entry point
- manage catalog titles and moods
- curate collections and homepage blocks
- inspect recommendation output in preview
- moderate reports
- review duplicate candidates and merge carefully
- use analytics to understand backlog and editorial state

