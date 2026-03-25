import { setTimeout as sleep } from 'node:timers/promises';
import { fetchJikanMangaPage } from './jikan-client.mjs';
import {
  createSyncRun,
  deriveMoodIds,
  ensureMoodSeed,
  finishSyncRun,
  inferSubtype,
  mapStatus,
  slugify,
  upsertNormalizedTitle,
} from './catalog-upsert.mjs';

function parseArgs(argv) {
  const entries = Object.fromEntries(
    argv.filter((arg) => arg.startsWith('--')).map((arg) => {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
      return [key, value];
    }),
  );

  return {
    startPage: Number(entries.startPage || 1),
    pages: Number(entries.pages || 6),
    all: entries.all === 'true',
    perPage: Number(entries.perPage || 25),
    orderBy: entries.orderBy || 'start_date',
    direction: entries.direction || 'desc',
    genres: entries.genres || '49',
    excludeBoysLove: entries.excludeBoysLove === 'true',
  };
}

function toYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear();
}

function normalizeJikanManga(item) {
  const mediaType = 'manga';
  const genreNames = [
    ...(item.genres || []).map((genre) => genre.name),
    ...(item.explicit_genres || []).map((genre) => genre.name),
    ...(item.themes || []).map((theme) => theme.name),
    ...(item.demographics || []).map((demo) => demo.name),
  ].filter(Boolean);
  const uniqueGenreNames = [...new Set(genreNames)];
  const { type, subtype } = inferSubtype({
    mediaType,
    originCountry: 'KR',
    originLanguage: 'ko',
    sourceHints: [item.type, ...uniqueGenreNames],
  });
  const canonicalTitle = item.title_english || item.title || item.title_japanese || `jikan-${item.mal_id}`;
  const slugBase = item.title_english || item.title || item.title_japanese || `manhwa-${item.mal_id}`;
  const avgScore = Number.isFinite(Number(item.score)) ? Number(item.score) * 10 : null;

  return {
    canonical: {
      slug: `${slugify(slugBase) || 'manhwa'}-mal-${item.mal_id}`,
      canonical_title: canonicalTitle,
      type,
      subtype,
      origin_country: 'KR',
      origin_language: 'ko',
      status: mapStatus(item.status, 'jikan'),
      release_year: toYear(item.published?.from),
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      episodes: null,
      duration_minutes: null,
      is_adult: true,
      cover_image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
      banner_image: null,
      synopsis: item.synopsis || null,
      avg_score: avgScore,
      mean_score: avgScore,
      popularity_score: item.members || item.scored_by || null,
      favorites_count: item.favorites || null,
      raw_payload: item,
      last_synced_at: new Date().toISOString(),
    },
    aliases: [
      item.title_english && {
        alias: item.title_english,
        language_code: 'en',
        alias_type: 'english',
        is_primary: true,
      },
      item.title && item.title !== item.title_english && {
        alias: item.title,
        language_code: 'ja-Latn',
        alias_type: 'romaji',
        is_primary: !item.title_english,
      },
      item.title_japanese && {
        alias: item.title_japanese,
        language_code: null,
        alias_type: 'native',
        is_primary: false,
      },
      ...(item.title_synonyms || []).filter(Boolean).map((alias) => ({
        alias,
        language_code: null,
        alias_type: 'synonym',
        is_primary: false,
      })),
    ].filter(Boolean),
    genres: uniqueGenreNames.map((genre_name) => ({ genre_name })),
    tags: uniqueGenreNames.map((tag_name) => ({
      tag_name,
      weight: null,
      source_provider: 'jikan',
    })),
    moods: deriveMoodIds([item.synopsis, ...uniqueGenreNames]),
    availability: [],
    studios: [],
    characters: [],
    staff: [],
    sourceRef: {
      provider: 'jikan',
      external_id: String(item.mal_id),
      external_url: item.url || null,
      source_priority: 25,
      raw_payload: item,
    },
  };
}

function hasNextPage(result, page) {
  if (typeof result?.pagination?.has_next_page === 'boolean') {
    return result.pagination.has_next_page;
  }

  const lastVisiblePage = Number(result?.pagination?.last_visible_page || 0);
  if (lastVisiblePage > 0) {
    return page < lastVisiblePage;
  }

  return Array.isArray(result?.data) && result.data.length > 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureMoodSeed();
  const runId = await createSyncRun('jikan');
  const genresExclude = args.excludeBoysLove ? '28,26' : undefined;

  let imported = 0;
  try {
    for (let page = args.startPage, pageCount = 0; args.all || pageCount < args.pages; page += 1, pageCount += 1) {
      const result = await fetchJikanMangaPage({
        page,
        limit: args.perPage,
        genres: args.genres,
        genresExclude,
        orderBy: args.orderBy,
        direction: args.direction,
      });

      for (const item of result.data || []) {
        const normalized = normalizeJikanManga(item);
        await upsertNormalizedTitle('jikan', normalized);
        imported += 1;
        console.log(`Imported ${normalized.canonical.canonical_title}`);
      }

      if (!hasNextPage(result, page)) break;
      await sleep(450);
    }

    await finishSyncRun(runId, { status: 'completed', records_processed: imported });
    console.log(`Jikan sync completed. Imported ${imported} records.`);
  } catch (error) {
    await finishSyncRun(runId, { status: 'failed', records_processed: imported, error_message: error.message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
