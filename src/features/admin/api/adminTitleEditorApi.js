import { supabase } from '@/shared/lib/supabase';
import { CANONICAL_TITLE_SELECT } from '@/shared/lib/catalog';

const ADMIN_SAVE_TIMEOUT_MS = 10000;

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

async function runQuery(request, label) {
  const result = await withTimeout(request, ADMIN_SAVE_TIMEOUT_MS, label);
  if (result?.error) {
    throw result.error;
  }
  return result;
}

export async function fetchAdminTitleMoods() {
  ensureSupabase();
  const { data } = await runQuery(
    supabase.from('moods').select('*').order('name_en'),
    'Load moods',
  );
  return data || [];
}

export async function fetchAdminTitleRecord(titleId) {
  ensureSupabase();
  const { data } = await runQuery(
    supabase
      .from('canonical_titles')
      .select(CANONICAL_TITLE_SELECT)
      .eq('id', titleId)
      .single(),
    'Load title details',
  );
  return data || null;
}

export async function createAdminTitle(payload) {
  ensureSupabase();
  const { data } = await runQuery(
    supabase.from('canonical_titles').insert([payload]).select().single(),
    'Create title',
  );
  return data;
}

export async function updateAdminTitle(titleId, payload) {
  ensureSupabase();
  await runQuery(
    supabase.from('canonical_titles').update(payload).eq('id', titleId),
    'Update title',
  );
}

export async function saveAdminTitleSourceReference(titleId, sourceRef) {
  ensureSupabase();
  await runQuery(
    supabase.from('title_source_refs').upsert(
      {
        canonical_title_id: titleId,
        ...sourceRef,
        last_synced_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'provider,external_id' },
    ),
    'Save AniList source reference',
  );
}

export async function syncAdminTitleRelations(titleId, nextRelations, previousRelations = null) {
  ensureSupabase();

  const areEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const operations = [];

  if (!previousRelations || !areEqual(previousRelations.aliases, nextRelations.aliases)) {
    operations.push(async () => {
      await runQuery(supabase.from('title_aliases').delete().eq('canonical_title_id', titleId), 'Delete aliases');
      if (nextRelations.aliases.length) {
        await runQuery(
          supabase.from('title_aliases').insert(
            nextRelations.aliases.map((item) => ({ canonical_title_id: titleId, ...item })),
          ),
          'Insert aliases',
        );
      }
    });
  }

  if (!previousRelations || !areEqual(previousRelations.moods, nextRelations.moods)) {
    operations.push(async () => {
      await runQuery(supabase.from('title_moods').delete().eq('canonical_title_id', titleId), 'Delete moods');
      if (nextRelations.moods.length) {
        await runQuery(
          supabase.from('title_moods').insert(
            nextRelations.moods.map((moodId) => ({ canonical_title_id: titleId, mood_id: moodId })),
          ),
          'Insert moods',
        );
      }
    });
  }

  if (!previousRelations || !areEqual(previousRelations.genres, nextRelations.genres)) {
    operations.push(async () => {
      await runQuery(supabase.from('title_genres').delete().eq('canonical_title_id', titleId), 'Delete genres');
      if (nextRelations.genres.length) {
        await runQuery(
          supabase.from('title_genres').insert(
            nextRelations.genres.map((genreName) => ({ canonical_title_id: titleId, genre_name: genreName })),
          ),
          'Insert genres',
        );
      }
    });
  }

  if (!previousRelations || !areEqual(previousRelations.tags, nextRelations.tags)) {
    operations.push(async () => {
      await runQuery(supabase.from('title_tags').delete().eq('canonical_title_id', titleId), 'Delete tags');
      if (nextRelations.tags.length) {
        await runQuery(
          supabase.from('title_tags').insert(
            nextRelations.tags.map((tagName) => ({ canonical_title_id: titleId, tag_name: tagName })),
          ),
          'Insert tags',
        );
      }
    });
  }

  if (!previousRelations || !areEqual(previousRelations.availability, nextRelations.availability)) {
    operations.push(async () => {
      await runQuery(supabase.from('title_availability').delete().eq('canonical_title_id', titleId), 'Delete availability');
      if (nextRelations.availability.length) {
        await runQuery(
          supabase.from('title_availability').insert(
            nextRelations.availability.map((platform) => ({
              canonical_title_id: titleId,
              platform_name: platform.platform_name,
              region_code: platform.region_code,
              url: platform.url,
              is_official: true,
            })),
          ),
          'Insert availability',
        );
      }
    });
  }

  await Promise.all(operations.map((operation) => operation()));
}
