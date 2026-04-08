import { supabase } from '@/shared/lib/supabase';
import { HOMEPAGE_BLOCK_SELECT, mapHomepageBlock } from '@/shared/lib/editorial';

const HOMEPAGE_BLOCK_SUMMARY_SELECT = `
  id,
  block_key,
  title,
  block_type,
  status,
  visibility,
  position,
  updated_at,
  collection_id,
  collection:editor_collections(id, slug, name, status, visibility)
`;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

export async function fetchHomepageBlockSummaries() {
  requireSupabase();

  const { data, error } = await supabase
    .from('homepage_content_blocks')
    .select(HOMEPAGE_BLOCK_SUMMARY_SELECT)
    .order('position', { ascending: true });

  if (error) throw error;

  return (data || []).map(mapHomepageBlock);
}

export async function fetchHomepageAdminCollections() {
  requireSupabase();

  const { data, error } = await supabase
    .from('editor_collections')
    .select('id, slug, name, status, visibility')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function fetchHomepageBlockDetail(blockId) {
  requireSupabase();

  if (!blockId) return null;

  const { data, error } = await supabase
    .from('homepage_content_blocks')
    .select(HOMEPAGE_BLOCK_SELECT)
    .eq('id', blockId)
    .maybeSingle();

  if (error) throw error;

  return data ? mapHomepageBlock(data) : null;
}

export async function fetchHomepageAdminData() {
  const [blocks, collections] = await Promise.all([
    fetchHomepageBlockSummaries(),
    fetchHomepageAdminCollections(),
  ]);

  return {
    blocks,
    collections,
  };
}

export async function saveHomepageBlock(blockId, payload, userId = null) {
  requireSupabase();

  if (blockId) {
    const { data, error } = await supabase
      .from('homepage_content_blocks')
      .update(payload)
      .eq('id', blockId)
      .select('id')
      .single();
    if (error) throw error;
    return data?.id || blockId;
  }

  const { data, error } = await supabase
    .from('homepage_content_blocks')
    .insert({
      ...payload,
      created_by: userId || null,
    })
    .select('id')
    .single();

  if (error) throw error;

  return data?.id || null;
}

export async function deleteHomepageBlock(blockId) {
  requireSupabase();

  const { error } = await supabase.from('homepage_content_blocks').delete().eq('id', blockId);
  if (error) throw error;
}
