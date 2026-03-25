# MoodsWatch Catalog Integration

This project now uses a canonical catalog model in Supabase with multi-source ingestion:

- AniList for broad anime/manga coverage
- Jikan for additional adult manhwa discovery
- PornhwaDB for server-side adult manhwa metadata sync when an API key is configured

## Documentation

- Full system guide: [docs/SYSTEM_GUIDE.md](/c:/Users/WiNDOWS%2011%20PRO/Desktop/ProjectPunlan/docs/SYSTEM_GUIDE.md)

## Database

Apply [supabase/migrations/20260314_canonical_catalog.sql](/c:/Users/WiNDOWS%2011%20PRO/Desktop/ProjectPunlan/supabase/migrations/20260314_canonical_catalog.sql).

Core catalog tables:

- `canonical_titles`
- `title_aliases`
- `title_source_refs`
- `title_genres`
- `title_tags`
- `title_relations`
- `title_availability`
- `title_moods`

Operational tables:

- `catalog_sync_runs`
- `catalog_merge_queue`

Convenience view:

- `catalog_titles_view`

## Environment

Required env vars:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# Optional for PornhwaDB ingestion:
PORNHWADB_API_KEY=...
```

For the admin-side PornhwaDB fetch tab, also deploy the Supabase Edge Function:

```bash
supabase functions deploy pornhwadb-proxy
supabase secrets set PORNHWADB_API_KEY=...
```

## Ingestion Commands

AniList:

```bash
npm run catalog:ingest:anilist
node scripts/catalog/ingest-anilist.mjs --type=MANGA --all=true --perPage=25 --countryOfOrigin=KR --averageScoreGreater=75 --popularityGreater=2000 --sort=POPULARITY_DESC
node scripts/catalog/ingest-anilist.mjs --type=MANGA --all=true --perPage=25 --countryOfOrigin=JP --averageScoreGreater=75 --popularityGreater=2000 --sort=POPULARITY_DESC
```

Jikan adult manhwa:

```bash
npm run catalog:ingest:jikan
node scripts/catalog/ingest-jikan.mjs --pages=8 --perPage=25 --orderBy=start_date --direction=desc
```

PornhwaDB adult manhwa metadata:

```bash
npm run catalog:ingest:pornhwadb
node scripts/catalog/ingest-pornhwadb.mjs --pages=10 --limit=50 --sort=updated_at --order=desc --status="On Going"
```

Run the full baseline sync:

```bash
npm run catalog:ingest:all
```

## What The Scripts Do

- fetch source records from AniList, Jikan, and optional PornhwaDB
- normalize them into the canonical schema
- classify `anime` / `manga` / `manhwa` / `manhua` / `webtoon`
- seed moods and derive mood mappings
- write aliases, genres, tags, source refs, and sync run logs

## Frontend

The app now reads catalog data from `canonical_titles` for:

- home recommendations
- discover search
- title detail
- admin dashboard
- admin titles
- admin analytics

## Verification

Build verified with:

```bash
npm run build
```
