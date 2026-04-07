import { supabase } from '@/shared/lib/supabase';
import { HOMEPAGE_BLOCK_PUBLIC_SELECT, mapHomepagePublicBlock } from '@/shared/lib/editorial';

export async function fetchPublishedHomepageBlocks() {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('homepage_content_blocks')
    .select(HOMEPAGE_BLOCK_PUBLIC_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('position', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapHomepagePublicBlock);
}
