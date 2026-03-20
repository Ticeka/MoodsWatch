import { createClient } from '@supabase/supabase-js';
import { MOODS } from '../../src/shared/data/moods.js';
import { loadEnv } from './load-env.mjs';

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeCatalogTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function mapStatus(status, provider = '') {
  const normalized = String(status || '').toUpperCase();

  if (['FINISHED', 'COMPLETED', 'COMPLETE', 'ENDED'].includes(normalized)) return 'completed';
  if (['NOT_YET_RELEASED', 'TBA', 'UPCOMING', 'UNRELEASED'].includes(normalized)) return 'upcoming';
  if (['HIATUS', 'ON_HIATUS'].includes(normalized)) return 'hiatus';
  if (['CANCELLED', 'CANCELED'].includes(normalized)) return 'cancelled';
  if (provider === 'jikan' && normalized === 'CURRENTLY_AIRING') return 'ongoing';
  return 'ongoing';
}

export function inferSubtype({ mediaType, originCountry, originLanguage, sourceHints = [] }) {
  if (mediaType === 'anime') return { type: 'anime', subtype: 'anime' };

  const hints = sourceHints.join(' ').toLowerCase();
  if (originCountry === 'KR' || originLanguage === 'ko' || hints.includes('manhwa') || hints.includes('webtoon')) {
    return { type: 'manga', subtype: hints.includes('webtoon') ? 'webtoon' : 'manhwa' };
  }
  if (originCountry === 'CN' || originLanguage === 'zh' || hints.includes('manhua')) {
    return { type: 'manga', subtype: 'manhua' };
  }

  return { type: 'manga', subtype: 'manga' };
}

export function deriveMoodIds(textParts) {
  const haystack = textParts.filter(Boolean).join(' ').toLowerCase();
  return MOODS.filter((mood) => mood.tags.some((tag) => haystack.includes(tag.toLowerCase()))).map((mood) => mood.id);
}

export async function ensureMoodSeed() {
  const rows = MOODS.map((mood) => ({
    id: mood.id,
    name_th: mood.name_th,
    name_en: mood.name_en,
    icon: mood.icon,
    color: mood.color,
    description: mood.description,
  }));

  const { error } = await supabaseAdmin.from('moods').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function createSyncRun(provider, runType = 'ingest') {
  const { data, error } = await supabaseAdmin
    .from('catalog_sync_runs')
    .insert({ provider, run_type: runType, status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST205') return null;
    throw error;
  }
  return data.id;
}

export async function finishSyncRun(id, updates) {
  if (!id) return;

  const { error } = await supabaseAdmin
    .from('catalog_sync_runs')
    .update({ ...updates, finished_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function resolveCanonicalTitleId(provider, externalId) {
  const { data, error } = await supabaseAdmin
    .from('title_source_refs')
    .select('canonical_title_id')
    .eq('provider', provider)
    .eq('external_id', String(externalId))
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST205') return null;
    throw error;
  }
  return data?.canonical_title_id || null;
}

async function resolveCanonicalTitleByMatch(normalized) {
  const { data, error } = await supabaseAdmin
    .from('canonical_titles')
    .select('id, canonical_title, type, subtype, release_year, origin_country, popularity_score')
    .eq('type', normalized.canonical.type)
    .limit(500);

  if (error) throw error;

  const targetNorm = normalizeCatalogTitle(normalized.canonical.canonical_title);
  if (!targetNorm) return null;

  const matches = (data || []).filter((row) => {
    if (normalizeCatalogTitle(row.canonical_title) !== targetNorm) return false;
    if ((row.origin_country || null) !== (normalized.canonical.origin_country || null)) return false;
    const existingYear = row.release_year || null;
    const incomingYear = normalized.canonical.release_year || null;
    if (existingYear && incomingYear && Math.abs(existingYear - incomingYear) > 1) return false;
    return true;
  });

  if (!matches.length) return null;

  matches.sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
  return matches[0].id;
}

async function replaceChildRows(table, titleId, rows) {
  const { error: deleteError } = await supabaseAdmin.from(table).delete().eq('canonical_title_id', titleId);
  if (deleteError) throw deleteError;

  if (!rows.length) return;

  const { error: insertError } = await supabaseAdmin.from(table).insert(rows);
  if (insertError) throw insertError;
}

function dedupeRows(rows, keyBuilder) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyBuilder(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function upsertNormalizedTitle(provider, normalized) {
  let titleId = await resolveCanonicalTitleId(provider, normalized.sourceRef.external_id);
  if (!titleId) {
    titleId = await resolveCanonicalTitleByMatch(normalized);
  }

  if (titleId) {
    const { error } = await supabaseAdmin.from('canonical_titles').update(normalized.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin
      .from('canonical_titles')
      .upsert(normalized.canonical, { onConflict: 'slug' })
      .select('id')
      .single();

    if (error) throw error;
    titleId = data.id;
  }

  await replaceChildRows(
    'title_aliases',
    titleId,
    dedupeRows(
      normalized.aliases.map((alias) => ({
        canonical_title_id: titleId,
        source_provider: provider,
        ...alias,
      })),
      (row) => [row.alias, row.language_code || '', row.alias_type].join('|'),
    ),
  );
  await replaceChildRows(
    'title_genres',
    titleId,
    dedupeRows(
      normalized.genres.map((genre) => ({ canonical_title_id: titleId, ...genre })),
      (row) => String(row.genre_name || '').toLowerCase(),
    ),
  );
  await replaceChildRows(
    'title_tags',
    titleId,
    dedupeRows(
      normalized.tags.map((tag) => ({ canonical_title_id: titleId, ...tag })),
      (row) => String(row.tag_name || '').toLowerCase(),
    ),
  );
  await replaceChildRows(
    'title_moods',
    titleId,
    dedupeRows(
      normalized.moods.map((mood_id) => ({ canonical_title_id: titleId, mood_id })),
      (row) => row.mood_id,
    ),
  );

  if (normalized.studios?.length) {
    await replaceChildRows(
      'title_studios',
      titleId,
      dedupeRows(
        normalized.studios.map((studio) => ({ canonical_title_id: titleId, ...studio })),
        (row) => String(row.studio_name || '').toLowerCase(),
      ),
    );
  }

  if (normalized.availability?.length) {
    await replaceChildRows(
      'title_availability',
      titleId,
      dedupeRows(
        normalized.availability.map((row) => ({ canonical_title_id: titleId, ...row })),
        (row) => [row.platform_name, row.region_code || '', row.url].join('|'),
      ),
    );
  }

  if (normalized.characters?.length) {
    await replaceChildRows(
      'title_characters',
      titleId,
      dedupeRows(
        normalized.characters.map((char) => ({ canonical_title_id: titleId, ...char })),
        (row) => String(row.anilist_id || row.name_full || '').toLowerCase(),
      ),
    );
  }

  if (normalized.staff?.length) {
    await replaceChildRows(
      'title_staff',
      titleId,
      dedupeRows(
        normalized.staff.map((member) => ({ canonical_title_id: titleId, ...member })),
        (row) => String(row.anilist_id || row.name_full || '').toLowerCase(),
      ),
    );
  }

  const { error: sourceRefError } = await supabaseAdmin.from('title_source_refs').upsert(
    {
      canonical_title_id: titleId,
      ...normalized.sourceRef,
      last_synced_at: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'provider,external_id' },
  );
  if (sourceRefError && sourceRefError.code !== 'PGRST205') throw sourceRefError;

  return titleId;
}
