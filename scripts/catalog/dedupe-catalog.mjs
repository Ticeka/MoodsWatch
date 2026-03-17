import { normalizeCatalogTitle, supabaseAdmin } from './catalog-upsert.mjs';

function pickWinner(rows) {
  return [...rows].sort((a, b) => {
    const pop = (b.popularity_score || 0) - (a.popularity_score || 0);
    if (pop !== 0) return pop;
    return a.id - b.id;
  })[0];
}

function sanitizeRow(table, row) {
  const { id, canonical_title_id, normalized_name, ...rest } = row;
  if (table === 'title_aliases') return rest;
  if (table === 'title_genres') return { genre_name: rest.genre_name };
  if (table === 'title_tags') return { tag_name: rest.tag_name, weight: rest.weight, source_provider: rest.source_provider };
  if (table === 'title_moods') return { mood_id: rest.mood_id };
  if (table === 'title_availability') return {
    platform_name: rest.platform_name,
    region_code: rest.region_code,
    url: rest.url,
    is_official: rest.is_official,
  };
  return rest;
}

function rowKey(table, row) {
  if (table === 'title_aliases') return [row.alias, row.language_code || '', row.alias_type].join('|');
  if (table === 'title_genres') return String(row.genre_name || '').toLowerCase();
  if (table === 'title_tags') return String(row.tag_name || '').toLowerCase();
  if (table === 'title_moods') return row.mood_id;
  if (table === 'title_availability') return [row.platform_name, row.region_code || '', row.url].join('|');
  return JSON.stringify(row);
}

async function mergeChildTable(table, keepId, dropId, extraUpdate = {}) {
  const { data, error } = await supabaseAdmin.from(table).select('*').in('canonical_title_id', [keepId, dropId]);
  if (error) throw error;

  const mergedRows = [];
  const seen = new Set();
  for (const row of data || []) {
    const normalized = {
      ...sanitizeRow(table, row),
      ...extraUpdate,
      canonical_title_id: keepId,
    };
    const key = rowKey(table, normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    mergedRows.push(normalized);
  }

  const { error: deleteError } = await supabaseAdmin.from(table).delete().in('canonical_title_id', [keepId, dropId]);
  if (deleteError) throw deleteError;

  if (mergedRows.length) {
    const { error: insertError } = await supabaseAdmin.from(table).insert(mergedRows);
    if (insertError) throw insertError;
  }
}

async function mergeTitle(keep, drop) {
  await mergeChildTable('title_aliases', keep.id, drop.id);
  await mergeChildTable('title_genres', keep.id, drop.id);
  await mergeChildTable('title_tags', keep.id, drop.id);
  await mergeChildTable('title_moods', keep.id, drop.id);
  await mergeChildTable('title_availability', keep.id, drop.id);

  const { error: sourceRefUpdateError } = await supabaseAdmin
    .from('title_source_refs')
    .update({ canonical_title_id: keep.id })
    .eq('canonical_title_id', drop.id);
  if (sourceRefUpdateError) throw sourceRefUpdateError;

  const { error: mergeQueueSourceError } = await supabaseAdmin
    .from('catalog_merge_queue')
    .update({ source_title_id: keep.id })
    .eq('source_title_id', drop.id);
  if (mergeQueueSourceError && mergeQueueSourceError.code !== 'PGRST205') throw mergeQueueSourceError;

  const { error: mergeQueueCandidateError } = await supabaseAdmin
    .from('catalog_merge_queue')
    .update({ candidate_title_id: keep.id })
    .eq('candidate_title_id', drop.id);
  if (mergeQueueCandidateError && mergeQueueCandidateError.code !== 'PGRST205') throw mergeQueueCandidateError;

  const { error: userListsError } = await supabaseAdmin
    .from('user_lists')
    .update({ title_id: keep.id })
    .eq('title_id', drop.id);
  if (userListsError && userListsError.code !== 'PGRST205') throw userListsError;

  const { error: deleteError } = await supabaseAdmin.from('canonical_titles').delete().eq('id', drop.id);
  if (deleteError) throw deleteError;
}

async function removeJunkDeleteTitles() {
  const { data, error } = await supabaseAdmin
    .from('canonical_titles')
    .select('id, canonical_title')
    .ilike('canonical_title', 'delete%');
  if (error) throw error;

  let removed = 0;
  for (const row of data || []) {
    const { error: refDeleteError } = await supabaseAdmin.from('title_source_refs').delete().eq('canonical_title_id', row.id);
    if (refDeleteError) throw refDeleteError;
    for (const table of ['title_aliases', 'title_genres', 'title_tags', 'title_moods', 'title_availability']) {
      const { error: childError } = await supabaseAdmin.from(table).delete().eq('canonical_title_id', row.id);
      if (childError) throw childError;
    }
    const { error: deleteError } = await supabaseAdmin.from('canonical_titles').delete().eq('id', row.id);
    if (deleteError) throw deleteError;
    removed += 1;
  }

  return removed;
}

async function main() {
  const { data, error } = await supabaseAdmin
    .from('canonical_titles')
    .select('id, canonical_title, type, subtype, release_year, origin_country, popularity_score');
  if (error) throw error;

  const removedJunk = await removeJunkDeleteTitles();

  const groups = new Map();
  for (const row of data || []) {
    if (/^delete\b/i.test(row.canonical_title || '')) continue;
    const key = [
      normalizeCatalogTitle(row.canonical_title),
      row.type,
      row.origin_country || '',
      row.release_year || '',
    ].join('|');
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  let merged = 0;
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const keep = pickWinner(rows);
    const drops = rows.filter((row) => row.id !== keep.id);
    for (const drop of drops) {
      await mergeTitle(keep, drop);
      merged += 1;
    }
  }

  console.log(JSON.stringify({ removedJunk, merged }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
