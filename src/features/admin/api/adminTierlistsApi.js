import { supabase } from '@/shared/lib/supabase';

const TEMPLATE_SELECT = 'id, owner_user_id, title, description, category, title_ids, default_rows, is_public, is_system, plays, created_at, updated_at';
const LIST_SELECT = 'id, owner_user_id, template_id, title, description, is_public, play_count, owner_name, owner_username, created_at, updated_at';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

function chunkItems(items = [], size = 50) {
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function fetchAdminTierlistData() {
  ensureSupabase();

  const [
    templateCountResult,
    listCountResult,
    commentCountResult,
    templateResult,
    listResult,
  ] = await Promise.all([
    supabase.from('tierlist_templates').select('*', { count: 'estimated', head: true }),
    supabase.from('tierlist_lists').select('*', { count: 'estimated', head: true }),
    supabase.from('tierlist_comments').select('*', { count: 'estimated', head: true }),
    supabase.from('tierlist_templates').select(TEMPLATE_SELECT).order('updated_at', { ascending: false }),
    supabase.from('tierlist_lists').select(LIST_SELECT).order('updated_at', { ascending: false }),
  ]);

  if (templateCountResult.error) throw templateCountResult.error;
  if (listCountResult.error) throw listCountResult.error;
  if (commentCountResult.error) throw commentCountResult.error;
  if (templateResult.error) throw templateResult.error;
  if (listResult.error) throw listResult.error;

  const templateRows = templateResult.data || [];
  const listRows = listResult.data || [];
  const listIds = listRows.map((row) => row.id);

  const commentsChunks = listIds.length > 0
    ? await Promise.all(
      chunkItems(listIds, 40).map((idChunk) => (
        supabase.from('tierlist_comments').select('list_id').in('list_id', idChunk)
      ))
    )
    : [];

  const [rowsResult, poolResult] = listIds.length > 0
    ? await Promise.all([
      supabase.from('tierlist_list_rows').select('id, list_id, position, label, color, title_ids').in('list_id', listIds),
      supabase.from('tierlist_list_pool_items').select('list_id, title_id, position').in('list_id', listIds),
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
    ];

  if (rowsResult.error) throw rowsResult.error;
  if (poolResult.error) throw poolResult.error;
  commentsChunks.forEach((result) => {
    if (result.error) {
      throw result.error;
    }
  });

  const ownerIds = [
    ...new Set([
      ...templateRows.map((row) => row.owner_user_id).filter(Boolean),
      ...listRows.map((row) => row.owner_user_id).filter(Boolean),
    ]),
  ];

  let profileRows = [];
  if (ownerIds.length > 0) {
    const profileResult = await supabase
      .from('user_profiles')
      .select('id, name, username')
      .in('id', ownerIds);
    if (profileResult.error) throw profileResult.error;
    profileRows = profileResult.data || [];
  }

  return {
    counts: {
      templateCount: Number(templateCountResult.count || templateRows.length),
      listCount: Number(listCountResult.count || listRows.length),
      commentCount: Number(commentCountResult.count || 0),
    },
    templateRows,
    listRows,
    commentRows: commentsChunks.flatMap((result) => result.data || []),
    listRowsData: rowsResult.data || [],
    listPoolData: poolResult.data || [],
    profileRows,
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
