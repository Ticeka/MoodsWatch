import { supabase } from '@/shared/lib/supabase';

const TEMPLATE_DETAIL_SELECT = 'id, owner_user_id, title, description, category, title_ids, default_rows, is_public, is_system, plays, created_at, updated_at';
const LIST_DETAIL_SELECT = 'id, owner_user_id, template_id, title, description, is_public, play_count, owner_name, created_at, updated_at';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

function maybeThrow(result) {
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

export async function fetchAdminTierlistOverview() {
  ensureSupabase();

  const result = await supabase.rpc('admin_get_tierlist_overview');
  const data = maybeThrow(result);

  return data?.[0] || {
    template_count: 0,
    public_template_count: 0,
    template_issue_count: 0,
    list_count: 0,
    public_list_count: 0,
    broken_public_list_count: 0,
    comment_count: 0,
  };
}

export async function fetchAdminTierlistTemplates() {
  ensureSupabase();

  const result = await supabase.rpc('admin_get_tierlist_template_summaries');
  return maybeThrow(result) || [];
}

export async function fetchAdminTierlistLists() {
  ensureSupabase();

  const result = await supabase.rpc('admin_get_tierlist_list_summaries');
  return maybeThrow(result) || [];
}

export async function fetchAdminTierlistRecordDetail(kind, recordId) {
  ensureSupabase();

  if (!recordId) {
    return null;
  }

  if (kind === 'template') {
    const detailResult = await supabase
      .from('tierlist_templates')
      .select(TEMPLATE_DETAIL_SELECT)
      .eq('id', recordId)
      .maybeSingle();

    const detail = maybeThrow(detailResult);
    if (!detail) return null;

    return {
      kind: 'template',
      defaultRows: Array.isArray(detail.default_rows) ? detail.default_rows : [],
      titleIds: Array.isArray(detail.title_ids) ? detail.title_ids : [],
    };
  }

  const [detailResult, rowsResult, poolResult] = await Promise.all([
    supabase
      .from('tierlist_lists')
      .select(LIST_DETAIL_SELECT)
      .eq('id', recordId)
      .maybeSingle(),
    supabase
      .from('tierlist_list_rows')
      .select('id, list_id, position, label, color, title_ids')
      .eq('list_id', recordId)
      .order('position', { ascending: true }),
    supabase
      .from('tierlist_list_pool_items')
      .select('list_id, title_id, position')
      .eq('list_id', recordId)
      .order('position', { ascending: true }),
  ]);

  const detail = maybeThrow(detailResult);
  const rows = maybeThrow(rowsResult) || [];
  const pool = maybeThrow(poolResult) || [];

  if (!detail) return null;

  return {
    kind: 'list',
    rows: rows.map((row) => ({
      id: row.id,
      label: row.label || '',
      color: row.color || '',
      position: Number(row.position || 0),
      titleIds: Array.isArray(row.title_ids) ? row.title_ids : [],
    })),
    poolItems: pool.map((row) => ({
      titleId: Number(row.title_id),
      position: Number(row.position || 0),
    })),
  };
}

export async function updateAdminTierlistVisibility(kind, recordId, isPublic) {
  ensureSupabase();

  const table = kind === 'template' ? 'tierlist_templates' : 'tierlist_lists';
  const { error } = await supabase.from(table).update({ is_public: isPublic }).eq('id', recordId);
  if (error) throw error;
}

export async function deleteAdminTierlistRecord(kind, recordId) {
  ensureSupabase();

  if (kind === 'template') {
    const { error } = await supabase.from('tierlist_templates').delete().eq('id', recordId);
    if (error) throw error;
    return;
  }

  const [commentsDelete, rowsDelete, poolDelete] = await Promise.all([
    supabase.from('tierlist_comments').delete().eq('list_id', recordId),
    supabase.from('tierlist_list_rows').delete().eq('list_id', recordId),
    supabase.from('tierlist_list_pool_items').delete().eq('list_id', recordId),
  ]);

  if (commentsDelete.error) throw commentsDelete.error;
  if (rowsDelete.error) throw rowsDelete.error;
  if (poolDelete.error) throw poolDelete.error;

  const { error } = await supabase.from('tierlist_lists').delete().eq('id', recordId);
  if (error) throw error;
}
