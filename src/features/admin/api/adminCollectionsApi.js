import { mapEditorCollection, EDITOR_COLLECTION_SELECT } from '@/shared/lib/editorial';
import { supabase } from '@/shared/lib/supabase';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

function getEnglishAlias(record) {
  return record?.aliases?.find((alias) => alias.alias_type === 'english' || alias.language_code === 'en')?.alias || '';
}

export async function fetchAdminCollectionSummaries() {
  ensureSupabase();

  const { data, error } = await supabase.rpc('admin_get_collection_summaries');
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

export async function fetchAdminCollectionDetail(collectionId) {
  ensureSupabase();
  if (!collectionId) return null;

  const { data, error } = await supabase
    .from('editor_collections')
    .select(EDITOR_COLLECTION_SELECT)
    .eq('id', collectionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapEditorCollection(data);
}

export async function searchAdminCollectionTitles(query = '', limit = 30) {
  ensureSupabase();

  let request = supabase
    .from('canonical_titles')
    .select('id, canonical_title, slug, type, subtype, aliases:aliases_cache')
    .order('popularity_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery) {
    request = request.or(`canonical_title.ilike.%${normalizedQuery}%,slug.ilike.%${normalizedQuery}%`);
  }

  const { data, error } = await request;
  if (error) throw error;

  return (data || []).map((record) => ({
    id: Number(record.id || 0),
    name: getEnglishAlias(record) || record.canonical_title || 'Untitled',
    type: record.subtype === 'manhwa' ? 'manhwa' : record.type,
  }));
}
