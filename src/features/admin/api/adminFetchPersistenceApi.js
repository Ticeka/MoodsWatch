import { annotateCharacterIdentities, normalizePresentationGender } from '@/shared/lib/characterIdentity';
import { supabase } from '@/shared/lib/supabase';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase unavailable');
  }
}

export async function fetchExistingTitleCharStaffState(titleId) {
  ensureSupabase();

  const [{ data: charRows, error: charError }, { count: existingStaffCount, error: staffError }] = await Promise.all([
    supabase
      .from('title_characters')
      .select('canonical_title_id, anilist_id, name_full, role, image_url, sort_order')
      .eq('canonical_title_id', titleId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('title_staff')
      .select('*', { count: 'exact', head: true })
      .eq('canonical_title_id', titleId),
  ]);

  if (charError) throw charError;
  if (staffError) throw staffError;

  return {
    charRows: charRows || [],
    existingStaffCount: existingStaffCount || 0,
  };
}

export async function upsertAdminTitleSourceRef(sourceRef, onConflict = 'provider,external_id') {
  ensureSupabase();

  const { error } = await supabase.from('title_source_refs').upsert(sourceRef, { onConflict });
  if (error && error.code !== 'PGRST205') throw error;
}

export async function updateAdminTitleTrailerPatch(titleId, patch) {
  ensureSupabase();

  const { error } = await supabase
    .from('canonical_titles')
    .update({
      ...patch,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', titleId);

  if (error) throw error;
}

function buildThemeSongRows(titleId, matched) {
  const anime = matched?.candidate;
  if (!anime?.animethemes?.length) {
    return [];
  }

  return anime.animethemes.flatMap((theme) => {
    if (!['OP', 'ED'].includes(theme?.type)) {
      return [];
    }

    return (theme.animethemeentries || []).flatMap((entry) => {
      return (entry.videos || []).map((video) => ({
        canonical_title_id: titleId,
        theme_type: theme.type,
        theme_sequence: Number(theme.sequence || 1),
        song_title: entry?.songs?.[0]?.title || theme.song?.title || null,
        artist_name: entry?.songs?.[0]?.artists?.map((artist) => artist?.name).filter(Boolean).join(', ') || null,
        episodes_text: entry?.episodes || null,
        video_url: video?.link || null,
        is_creditless: Boolean(entry?.nc),
        is_spoiler: Boolean(entry?.spoiler),
        is_subbed: Boolean(video?.subbed),
        metadata: {
          matched_query: matched?.queryName || null,
          matched_by: matched?.matchedBy || null,
          anime_name: anime?.name || null,
          anime_slug: anime?.slug || null,
          video_filename: video?.filename || null,
          video_tags: video?.tags || null,
        },
        fetched_at: new Date().toISOString(),
      }));
    });
  });
}

async function upsertTitleByProvider(norm, provider, externalId, skipDuplicates) {
  ensureSupabase();

  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', provider).eq('external_id', externalId).maybeSingle();
  if (existingRef?.canonical_title_id && skipDuplicates) return 'skipped';

  let titleId = existingRef?.canonical_title_id || null;
  const wasExisting = !!titleId;

  if (!titleId) {
    const { data: bySlug } = await supabase.from('canonical_titles').select('id').eq('slug', norm.canonical.slug).maybeSingle();
    if (bySlug?.id && skipDuplicates) return 'skipped';
    titleId = bySlug?.id || null;
  }

  if (titleId) {
    const { error } = await supabase.from('canonical_titles').update(norm.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('canonical_titles').upsert(norm.canonical, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    titleId = data.id;
  }

  for (const { table, rows } of [
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: provider, ...a })) },
    { table: 'title_genres', rows: norm.genres.map((g) => ({ canonical_title_id: titleId, ...g })) },
    { table: 'title_tags', rows: norm.tags.map((t) => ({ canonical_title_id: titleId, ...t })) },
    { table: 'title_moods', rows: norm.moodIds.map((mood_id) => ({ canonical_title_id: titleId, mood_id })) },
  ]) {
    const { error: delErr } = await supabase.from(table).delete().eq('canonical_title_id', titleId);
    if (delErr) throw delErr;
    if (rows.length) {
      const { error: insErr } = await supabase.from(table).insert(rows);
      if (insErr) throw insErr;
    }
  }

  const { error: refErr } = await supabase.from('title_source_refs').upsert(
    { canonical_title_id: titleId, ...norm.sourceRef, last_synced_at: new Date().toISOString(), fetched_at: new Date().toISOString() },
    { onConflict: 'provider,external_id' },
  );
  if (refErr && refErr.code !== 'PGRST205') throw refErr;

  return wasExisting ? 'updated' : 'imported';
}

export async function replaceTitleThemeSongs(titleId, matched) {
  ensureSupabase();
  const rows = buildThemeSongRows(titleId, matched);
  const { error: deleteError } = await supabase.from('title_theme_songs').delete().eq('canonical_title_id', titleId);
  if (deleteError) throw deleteError;

  if (rows.length) {
    const { error: insertError } = await supabase.from('title_theme_songs').insert(rows);
    if (insertError) throw insertError;
  }

  const { error: titleError } = await supabase
    .from('canonical_titles')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', titleId);
  if (titleError) throw titleError;

  return {
    rows: rows.length,
    themes: (matched?.candidate?.animethemes || []).filter((theme) => ['OP', 'ED'].includes(theme?.type)).length,
  };
}

export async function upsertTitle(norm, skipDuplicates) {
  return upsertTitleByProvider(norm, 'anilist', norm.anilistId, skipDuplicates);
}

export async function upsertJikanTitle(norm, skipDuplicates) {
  return upsertTitleByProvider(norm, 'jikan', norm.malId, skipDuplicates);
}

export async function upsertPornhwaDbTitle(norm, skipDuplicates) {
  ensureSupabase();

  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', 'pornhwadb').eq('external_id', norm.pornhwaId).maybeSingle();
  if (existingRef?.canonical_title_id && skipDuplicates) return 'skipped';

  let titleId = existingRef?.canonical_title_id || null;
  const wasExisting = !!titleId;

  if (!titleId) {
    const { data: bySlug } = await supabase.from('canonical_titles').select('id').eq('slug', norm.canonical.slug).maybeSingle();
    if (bySlug?.id && skipDuplicates) return 'skipped';
    titleId = bySlug?.id || null;
  }

  if (titleId) {
    const { error } = await supabase.from('canonical_titles').update(norm.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('canonical_titles').upsert(norm.canonical, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    titleId = data.id;
  }

  for (const { table, rows } of [
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: 'pornhwadb', ...a })) },
    { table: 'title_genres', rows: norm.genres.map((g) => ({ canonical_title_id: titleId, ...g })) },
    { table: 'title_tags', rows: norm.tags.map((t) => ({ canonical_title_id: titleId, ...t })) },
    { table: 'title_moods', rows: norm.moodIds.map((mood_id) => ({ canonical_title_id: titleId, mood_id })) },
    { table: 'title_staff', rows: (norm.staff || []).map((s) => ({ canonical_title_id: titleId, ...s })) },
  ]) {
    const { error: delErr } = await supabase.from(table).delete().eq('canonical_title_id', titleId);
    if (delErr) throw delErr;
    if (rows.length) {
      const { error: insErr } = await supabase.from(table).insert(rows);
      if (insErr) throw insErr;
    }
  }

  const { error: refErr } = await supabase.from('title_source_refs').upsert(
    { canonical_title_id: titleId, ...norm.sourceRef, last_synced_at: new Date().toISOString(), fetched_at: new Date().toISOString() },
    { onConflict: 'provider,external_id' },
  );
  if (refErr && refErr.code !== 'PGRST205') throw refErr;
  return wasExisting ? 'updated' : 'imported';
}

export async function upsertCharStaff(titleId, media, options = {}) {
  ensureSupabase();
  const { error: delStaffErr } = await supabase.from('title_staff').delete().eq('canonical_title_id', titleId);
  if (delStaffErr) throw delStaffErr;

  const rawChars = (media?.characters?.edges || []).map((edge, i) => ({
    canonical_title_id: titleId,
    anilist_id: edge.node?.id ?? null,
    name_full: edge.node?.name?.full ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_url: edge.node?.image?.medium ?? null,
    role: edge.role ?? null,
    presentation_gender: normalizePresentationGender(edge.node?.gender),
    voice_actor_name: edge.voiceActors?.[0]?.name?.full ?? null,
    voice_actor_image: edge.voiceActors?.[0]?.image?.medium ?? null,
    sort_order: i,
  }));
  const chars = annotateCharacterIdentities(rawChars);

  const dedupedChars = [];
  const seenAniListIds = new Set();
  for (const character of chars) {
    const dedupeKey = character.anilist_id ?? `fallback:${character.name_full ?? ''}:${character.role ?? ''}:${character.sort_order}`;
    if (seenAniListIds.has(dedupeKey)) continue;
    seenAniListIds.add(dedupeKey);
    dedupedChars.push(character);
  }

  const staff = (media?.staff?.edges || []).map((edge, i) => ({
    canonical_title_id: titleId,
    anilist_id: edge.node?.id ?? null,
    name_full: edge.node?.name?.full ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_url: edge.node?.image?.medium ?? null,
    role: edge.role ?? null,
    sort_order: i,
  }));

  const { data: existingChars, error: existingCharsErr } = await supabase
    .from('title_characters')
    .select('id, anilist_id')
    .eq('canonical_title_id', titleId);
  if (existingCharsErr) throw existingCharsErr;

  const existingByAniListId = new Map(
    (existingChars || [])
      .filter((row) => row.anilist_id != null)
      .map((row) => [row.anilist_id, row]),
  );

  const incomingAniListIds = new Set(dedupedChars.map((row) => row.anilist_id).filter((value) => value != null));

  for (const character of dedupedChars) {
    const existingRow = character.anilist_id != null ? existingByAniListId.get(character.anilist_id) : null;
    if (existingRow?.id) {
      const { error } = await supabase
        .from('title_characters')
        .update({
          name_full: character.name_full,
          name_native: character.name_native,
          image_url: character.image_url,
          role: character.role,
          presentation_gender: character.presentation_gender,
          lead_type: character.lead_type,
          is_primary_protagonist: Boolean(character.is_primary_protagonist),
          is_primary_heroine: Boolean(character.is_primary_heroine),
          voice_actor_name: character.voice_actor_name,
          voice_actor_image: character.voice_actor_image,
          sort_order: character.sort_order,
        })
        .eq('id', existingRow.id);
      if (error) throw error;
      continue;
    }

    const { error } = await supabase.from('title_characters').insert(character);
    if (error) throw error;
  }

  if (options.pruneStaleCharacters !== false) {
    const staleCharIds = (existingChars || [])
      .filter((row) => row.anilist_id == null || !incomingAniListIds.has(row.anilist_id))
      .map((row) => row.id);

    if (staleCharIds.length) {
      const { data: referencedClues, error: referencedCluesErr } = await supabase
        .from('party_title_guess_clues')
        .select('character_id')
        .in('character_id', staleCharIds);
      if (referencedCluesErr && referencedCluesErr.code !== 'PGRST205') throw referencedCluesErr;

      const referencedIds = new Set((referencedClues || []).map((row) => row.character_id));
      const deletableCharIds = staleCharIds.filter((id) => !referencedIds.has(id));
      if (deletableCharIds.length) {
        const { error } = await supabase.from('title_characters').delete().in('id', deletableCharIds);
        if (error) throw error;
      }
    }
  }

  if (staff.length) {
    const { error } = await supabase.from('title_staff').insert(staff);
    if (error) throw error;
  }
  return { chars: dedupedChars.length, staff: staff.length };
}

export async function fetchPornhwaDbCharactersViaProxy(slug, apiKey, signal) {
  ensureSupabase();
  const { data, error } = await supabase.functions.invoke('pornhwadb-proxy', {
    body: { path: 'title-characters', slug, apiKey: apiKey || undefined },
    signal,
  });
  if (error) {
    if (typeof error.context?.json === 'function') {
      try {
        const payload = await error.context.json();
        throw new Error(payload?.error || payload?.message || error.message || 'PornhwaDB characters fetch failed');
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) throw contextError;
      }
    }
    if (typeof error.context?.text === 'function') {
      try {
        const message = await error.context.text();
        if (message) throw new Error(message);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) throw contextError;
      }
    }
    throw new Error(error.message || 'PornhwaDB characters fetch failed');
  }
  return data;
}

export async function upsertPornhwaDbCharacters(titleId, characters) {
  ensureSupabase();
  const rawRows = (characters || []).map((char, i) => ({
    canonical_title_id: titleId,
    anilist_id: null,
    name_full: char.name || null,
    name_native: (char.alternativeNames || []).find((n) => /[ก-๙가-힣]/.test(n)) || null,
    image_url: char.image || null,
    role: char.role ? char.role.toUpperCase() : null,
    presentation_gender: normalizePresentationGender(char.gender),
    sort_order: i,
  }));
  const rows = annotateCharacterIdentities(rawRows);

  const { data: existingChars, error: existingCharsErr } = await supabase
    .from('title_characters')
    .select('id, name_full, role')
    .eq('canonical_title_id', titleId);
  if (existingCharsErr) throw existingCharsErr;

  const existingByKey = new Map(
    (existingChars || []).map((row) => [`${row.name_full ?? 'unknown'}:${row.role ?? ''}`, row]),
  );
  const incomingKeys = new Set();

  for (const row of rows) {
    const rowKey = `${row.name_full ?? 'unknown'}:${row.role ?? ''}`;
    incomingKeys.add(rowKey);
    const existingRow = existingByKey.get(rowKey);
    if (existingRow?.id) {
      const { error } = await supabase
        .from('title_characters')
        .update({
          name_native: row.name_native,
          image_url: row.image_url,
          presentation_gender: row.presentation_gender,
          lead_type: row.lead_type,
          is_primary_protagonist: Boolean(row.is_primary_protagonist),
          is_primary_heroine: Boolean(row.is_primary_heroine),
          sort_order: row.sort_order,
        })
        .eq('id', existingRow.id);
      if (error) throw error;
      continue;
    }

    const { error } = await supabase.from('title_characters').insert(row);
    if (error) throw error;
  }

  const staleCharIds = (existingChars || [])
    .filter((row) => !incomingKeys.has(`${row.name_full ?? 'unknown'}:${row.role ?? ''}`))
    .map((row) => row.id);

  if (staleCharIds.length) {
    const { data: referencedClues, error: referencedCluesErr } = await supabase
      .from('party_title_guess_clues')
      .select('character_id')
      .in('character_id', staleCharIds);
    if (referencedCluesErr && referencedCluesErr.code !== 'PGRST205') throw referencedCluesErr;

    const referencedIds = new Set((referencedClues || []).map((row) => row.character_id));
    const deletableCharIds = staleCharIds.filter((id) => !referencedIds.has(id));
    if (deletableCharIds.length) {
      const { error } = await supabase.from('title_characters').delete().in('id', deletableCharIds);
      if (error) throw error;
    }
  }
  return rows.length;
}
