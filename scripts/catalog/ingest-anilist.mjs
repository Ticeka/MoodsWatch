import { fetchAniListPage } from './anilist-client.mjs';
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
    type: entries.type || 'ANIME',
    startPage: Number(entries.startPage || 1),
    pages: Number(entries.pages || 2),
    all: entries.all === 'true',
    perPage: Number(entries.perPage || 25),
    sort: entries.sort ? entries.sort.split(',') : ['POPULARITY_DESC'],
    formatIn: entries.formatIn ? entries.formatIn.split(',') : undefined,
    status: entries.status || undefined,
    countryOfOrigin: entries.countryOfOrigin || undefined,
    averageScoreGreater: entries.averageScoreGreater ? Number(entries.averageScoreGreater) : undefined,
    popularityGreater: entries.popularityGreater ? Number(entries.popularityGreater) : undefined,
  };
}

function buildDate(d) {
  if (!d?.year) return null;
  const mm = String(d.month || 1).padStart(2, '0');
  const dd = String(d.day || 1).padStart(2, '0');
  return `${d.year}-${mm}-${dd}`;
}

function buildTrailerUrl(trailer) {
  if (!trailer?.id) return null;
  if (trailer.site === 'youtube') return `https://www.youtube.com/watch?v=${trailer.id}`;
  if (trailer.site === 'dailymotion') return `https://www.dailymotion.com/video/${trailer.id}`;
  return null;
}

function buildTrailerThumbnailUrl(trailer) {
  if (trailer?.thumbnail) return trailer.thumbnail;
  if (trailer?.site === 'youtube' && trailer?.id) {
    return `https://i.ytimg.com/vi/${trailer.id}/hqdefault.jpg`;
  }
  return null;
}

function normalizeAniListMedia(media) {
  const mediaType = media.type === 'ANIME' ? 'anime' : 'manga';
  const { type, subtype } = inferSubtype({
    mediaType,
    originCountry: media.countryOfOrigin || null,
    originLanguage: media.countryOfOrigin === 'JP' ? 'ja' : media.countryOfOrigin === 'KR' ? 'ko' : media.countryOfOrigin === 'CN' ? 'zh' : null,
    sourceHints: [media.format, ...(media.genres || []), ...(media.tags || []).map((tag) => tag.name)],
  });
  const canonicalTitle = media.title.english || media.title.romaji || media.title.native || `anilist-${media.id}`;
  const slugBase = media.title.english || media.title.romaji || media.title.native || `${type}-${media.id}`;

  return {
    canonical: {
      slug: `${slugify(slugBase) || type}-${media.id}`,
      canonical_title: canonicalTitle,
      type,
      subtype,
      origin_country: media.countryOfOrigin || null,
      origin_language: media.countryOfOrigin === 'JP' ? 'ja' : media.countryOfOrigin === 'KR' ? 'ko' : media.countryOfOrigin === 'CN' ? 'zh' : null,
      status: mapStatus(media.status),
      release_year: media.seasonYear || null,
      episodes: media.episodes || null,
      chapters: media.chapters || null,
      volumes: media.volumes || null,
      duration_minutes: media.duration || null,
      is_adult: Boolean(media.isAdult),
      cover_image: media.coverImage?.extraLarge || media.coverImage?.large || null,
      banner_image: media.bannerImage || null,
      synopsis: media.description || null,
      avg_score: media.averageScore || null,
      mean_score: media.meanScore || null,
      popularity_score: media.popularity || null,
      favorites_count: media.favourites || null,
      format: media.format || null,
      season: media.season || null,
      season_year: media.seasonYear || null,
      hashtag: media.hashtag || null,
      trailer_url: buildTrailerUrl(media.trailer),
      trailer_site: media.trailer?.site?.toLowerCase?.() || null,
      trailer_video_id: media.trailer?.id || null,
      trailer_thumbnail_url: buildTrailerThumbnailUrl(media.trailer),
      trailer_source: media.trailer?.id ? 'anilist' : null,
      start_date: buildDate(media.startDate),
      end_date: buildDate(media.endDate),
      raw_payload: media,
      last_synced_at: new Date().toISOString(),
    },
    aliases: [
      media.title.english && { alias: media.title.english, language_code: 'en', alias_type: 'english', is_primary: true },
      media.title.romaji && { alias: media.title.romaji, language_code: 'ja-Latn', alias_type: 'romaji', is_primary: !media.title.english },
      media.title.native && { alias: media.title.native, language_code: null, alias_type: 'native', is_primary: false },
      ...(media.synonyms || []).filter(Boolean).map((alias) => ({ alias, language_code: null, alias_type: 'synonym', is_primary: false })),
    ].filter(Boolean),
    genres: (media.genres || []).map((genre_name) => ({ genre_name })),
    tags: (media.tags || []).map((tag) => ({ tag_name: tag.name, weight: tag.rank || null, source_provider: 'anilist' })),
    moods: deriveMoodIds([media.description, ...(media.genres || []), ...(media.tags || []).map((tag) => tag.name)]),
    availability: [],
    studios: (media.studios?.nodes || []).map((s) => ({
      studio_name: s.name,
      is_animation_studio: Boolean(s.isAnimationStudio),
    })),
    characters: (media.characters?.edges || []).map((edge, index) => ({
      anilist_id: edge.node?.id || null,
      name_full: edge.node?.name?.full || null,
      name_native: edge.node?.name?.native || null,
      image_url: edge.node?.image?.large || null,
      role: edge.role || null,
      voice_actor_name: edge.voiceActors?.[0]?.name?.full || null,
      voice_actor_image: edge.voiceActors?.[0]?.image?.large || null,
      sort_order: index,
    })),
    staff: (media.staff?.edges || []).map((edge, index) => ({
      anilist_id: edge.node?.id || null,
      name_full: edge.node?.name?.full || null,
      name_native: edge.node?.name?.native || null,
      image_url: edge.node?.image?.large || null,
      role: edge.role || null,
      sort_order: index,
    })),
    sourceRef: {
      provider: 'anilist',
      external_id: String(media.id),
      external_url: media.siteUrl || null,
      source_priority: media.type === 'ANIME' ? 10 : subtype === 'manhwa' ? 20 : 10,
      raw_payload: media,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureMoodSeed();
  const runId = await createSyncRun('anilist');

  let imported = 0;
  try {
    for (let page = args.startPage, pageCount = 0; args.all || pageCount < args.pages; page += 1, pageCount += 1) {
      const result = await fetchAniListPage({
        page,
        perPage: args.perPage,
        type: args.type,
        sort: args.sort,
        formatIn: args.formatIn,
        status: args.status,
        countryOfOrigin: args.countryOfOrigin,
        averageScoreGreater: args.averageScoreGreater,
        popularityGreater: args.popularityGreater,
      });
      for (const media of result.media || []) {
        await upsertNormalizedTitle('anilist', normalizeAniListMedia(media));
        imported += 1;
        console.log(`Imported ${media.title?.english || media.title?.romaji || media.id}`);
      }
      if (!result.media?.length || !result.pageInfo?.hasNextPage) break;
    }

    await finishSyncRun(runId, { status: 'completed', records_processed: imported });
    console.log(`AniList sync completed. Imported ${imported} records.`);
  } catch (error) {
    await finishSyncRun(runId, { status: 'failed', records_processed: imported, error_message: error.message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
