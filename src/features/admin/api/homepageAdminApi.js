import { supabase } from '@/shared/lib/supabase';
import { HOMEPAGE_BLOCK_SELECT, mapHomepageBlock } from '@/shared/lib/editorial';

export async function fetchHomepageAdminData() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const [blocksRes, collectionsRes] = await Promise.all([
    supabase.from('homepage_content_blocks').select(HOMEPAGE_BLOCK_SELECT).order('position', { ascending: true }),
    supabase.from('editor_collections').select('id, slug, name, status, visibility').order('updated_at', { ascending: false }),
  ]);

  if (blocksRes.error) throw blocksRes.error;
  if (collectionsRes.error) throw collectionsRes.error;

  return {
    blocks: (blocksRes.data || []).map(mapHomepageBlock),
    collections: collectionsRes.data || [],
  };
}

export async function saveHomepageBlock(blockId, payload, userId = null) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  if (blockId) {
    const { error } = await supabase.from('homepage_content_blocks').update(payload).eq('id', blockId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('homepage_content_blocks').insert({
    ...payload,
    created_by: userId || null,
  });

  if (error) throw error;
}

export async function deleteHomepageBlock(blockId) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const { error } = await supabase.from('homepage_content_blocks').delete().eq('id', blockId);
  if (error) throw error;
}
