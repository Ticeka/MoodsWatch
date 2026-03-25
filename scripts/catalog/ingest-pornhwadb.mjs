import { fetchPornhwaDbList, fetchPornhwaDbCharacters } from './pornhwadb-client.mjs';
import {
  createSyncRun,
  deriveMoodIds,
  ensureMoodSeed,
  finishSyncRun,
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
    pages: Number(entries.pages || 8),
    all: entries.all === 'true',
    limit: Number(entries.limit || 50),
    sort: entries.sort || 'updated_at',
    order: entries.order || 'desc',
    status: entries.status || undefined,
    orientation: entries.orientation || undefined,
    dataStatus: entries.dataStatus || undefined,
    search: entries.search || undefined,
    minRating: entries.minRating ? Number(entries.minRating) : undefined,
    minRatings: entries.minRatings ? Number(entries.minRatings) : undefined,
    releaseYearGte: entries.releaseYearGte ? Number(entries.releaseYearGte) : undefined,
    releaseYearLte: entries.releaseYearLte ? Number(entries.releaseYearLte) : undefined,
    fetchCharacters: entries.fetchCharacters === 'true',
  };
}

function buildPartialDate(year, month) {
  if (!year) return null;
  const normalizedMonth = String(month || 1).padStart(2, '0');
  return `${year}-${normalizedMonth}-01`;
}

function normalizePornhwaTag(value) {
  return String(value || '').trim().toLowerCase();
}

function isBoysLovePornhwa(entry) {
  const tags = [
    entry.orientation,
    ...(entry.genreTags || []),
    ...(entry.tags || []),
  ].map(normalizePornhwaTag);

  return tags.some((tag) => ['yaoi', 'boys love', 'boys-love', 'bl', 'shounen ai', 'shonen ai'].includes(tag));
}

function normalizePornhwaEntry(entry) {
  const canonicalTitle = entry.title || `pornhwadb-${entry.id}`;
  const slugBase = entry.slug || entry.title || `manhwa-${entry.id}`;
  const genreTags = [...new Set((entry.genreTags || []).filter(Boolean))];
  const tagNames = [...new Set([...genreTags, entry.orientation || null].filter(Boolean))];
  const averageRating = Number(entry.averageRating);
  const normalizedScore = Number.isFinite(averageRating) ? averageRating * 20 : null;

  return {
    canonical: {
      slug: `${slugify(slugBase) || 'manhwa'}-pwdb-${entry.id}`,
      canonical_title: canonicalTitle,
      type: 'manga',
      subtype: 'manhwa',
      origin_country: 'KR',
      origin_language: 'ko',
      status: mapStatus(entry.status, 'pornhwadb'),
      release_year: entry.releaseYear || null,
      chapters: entry.totalChapters || entry.chapterCount || null,
      volumes: null,
      episodes: null,
      duration_minutes: null,
      is_adult: true,
      cover_image: entry.coverImage || null,
      banner_image: null,
      synopsis: entry.description || null,
      avg_score: normalizedScore,
      mean_score: normalizedScore,
      popularity_score: entry.totalRatings || null,
      start_date: buildPartialDate(entry.releaseYear, entry.releaseMonth),
      end_date: buildPartialDate(entry.endYear, entry.endMonth),
      raw_payload: entry,
      last_synced_at: new Date().toISOString(),
    },
    aliases: canonicalTitle
      ? [
          {
            alias: canonicalTitle,
            language_code: 'en',
            alias_type: 'english',
            is_primary: true,
          },
        ]
      : [],
    genres: genreTags.map((genre_name) => ({ genre_name })),
    tags: tagNames.map((tag_name) => ({
      tag_name,
      weight: null,
      source_provider: 'pornhwadb',
    })),
    moods: deriveMoodIds([
      entry.description,
      ...genreTags,
      ...(entry.creators || []).map((creator) => creator.canonicalName),
    ]),
    availability: [],
    studios: [],
    characters: [],
    staff: (entry.creators || [])
      .filter((c) => c?.canonicalName)
      .map((c, i) => ({
        name_full: c.canonicalName,
        name_native: Array.isArray(c.aliases)
          ? (c.aliases.find((a) => /[가-힣]/.test(a)) || null)
          : null,
        role: c.role || 'creator',
        sort_order: i,
      })),
    sourceRef: {
      provider: 'pornhwadb',
      external_id: String(entry.id),
      external_url: null,
      source_priority: 15,
      raw_payload: entry,
    },
  };
}

function hasNextPage(result, page, limit) {
  const pagination = result?.pagination || {};

  if (typeof pagination.hasNextPage === 'boolean') return pagination.hasNextPage;
  if (typeof pagination.has_next_page === 'boolean') return pagination.has_next_page;

  const totalPages = Number(pagination.totalPages || pagination.total_pages || 0);
  if (totalPages > 0) return page < totalPages;

  const nextPage = Number(pagination.nextPage || pagination.next_page || 0);
  if (nextPage > 0) return nextPage > page;

  const total = Number(pagination.total || pagination.totalItems || pagination.total_items || 0);
  if (total > 0) return page * limit < total;

  return Array.isArray(result?.data) && result.data.length >= limit;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (normalizePornhwaTag(args.orientation) === 'yaoi') {
    throw new Error('Yaoi requests are blocked by policy');
  }
  await ensureMoodSeed();
  const runId = await createSyncRun('pornhwadb');

  let imported = 0;
  try {
    for (let page = args.startPage, pageCount = 0; args.all || pageCount < args.pages; page += 1, pageCount += 1) {
      const result = await fetchPornhwaDbList({
        page,
        limit: args.limit,
        sort: args.sort,
        order: args.order,
        status: args.status,
        orientation: args.orientation,
        dataStatus: args.dataStatus,
        search: args.search,
        minRating: args.minRating,
        minRatings: args.minRatings,
        releaseYearGte: args.releaseYearGte,
        releaseYearLte: args.releaseYearLte,
      });

      for (const entry of result.data || []) {
        if (isBoysLovePornhwa(entry)) {
          console.log(`Skipped BL/Yaoi ${entry.title || entry.id}`);
          continue;
        }
        const normalized = normalizePornhwaEntry(entry);
        if (args.fetchCharacters && entry.slug) {
          try {
            const charResult = await fetchPornhwaDbCharacters(entry.slug);
            normalized.characters = (charResult?.data || []).map((char, i) => ({
              name_full: char.name || null,
              name_native: (char.alternativeNames || []).find((n) => /[가-힣]/.test(n)) || null,
              image_url: char.image || null,
              role: char.role ? char.role.toUpperCase() : null,
              sort_order: i,
            }));
          } catch (charErr) {
            console.warn(`  [chars] ${entry.title}: ${charErr.message}`);
          }
        }
        await upsertNormalizedTitle('pornhwadb', normalized);
        imported += 1;
        console.log(`Imported ${normalized.canonical.canonical_title}${normalized.characters.length ? ` (${normalized.characters.length} chars)` : ''}`);
      }

      if (!hasNextPage(result, page, args.limit)) break;
    }

    await finishSyncRun(runId, { status: 'completed', records_processed: imported });
    console.log(`PornhwaDB sync completed. Imported ${imported} records.`);
  } catch (error) {
    await finishSyncRun(runId, { status: 'failed', records_processed: imported, error_message: error.message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
