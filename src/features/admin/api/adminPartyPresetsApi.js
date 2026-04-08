import { supabase } from '@/shared/lib/supabase';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

export async function fetchAdminPartyPresetSummaries() {
  ensureSupabase();

  const { data, error } = await supabase.rpc('admin_get_party_preset_summaries');
  if (error) throw error;

  return (data || []).map((record) => ({
    id: Number(record.id || 0),
    slug: record.slug || '',
    name: record.name || '',
    description: record.description || '',
    status: record.status || 'draft',
    visibility: record.visibility || 'public',
    updatedAt: record.updated_at || '',
    itemCount: Number(record.item_count || 0),
  }));
}

export async function fetchAdminPartyPresetItems(presetId) {
  ensureSupabase();
  if (!presetId) return [];

  const { data, error } = await supabase
    .from('party_song_preset_items')
    .select('*')
    .eq('preset_id', presetId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}
