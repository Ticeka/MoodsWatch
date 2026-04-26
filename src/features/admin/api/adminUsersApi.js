import { supabase } from '@/shared/lib/supabase';

const ADMIN_USER_SELECT = 'id, name, username, role, avatar_url, created_at';

export async function fetchAdminUsersPage({
  page = 1,
  pageSize = 50,
  searchTerm = '',
  roleFilter = 'all',
  sortBy = 'newest',
} = {}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  let query = supabase
    .from('user_profiles')
    .select(ADMIN_USER_SELECT, { count: 'planned' });

  if (roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }

  const normalizedSearchTerm = String(searchTerm || '').trim();
  if (normalizedSearchTerm) {
    const searchClauses = [
      `name.ilike.%${normalizedSearchTerm}%`,
      `username.ilike.%${normalizedSearchTerm}%`,
    ];

    if (/^[0-9a-f-]{32,36}$/i.test(normalizedSearchTerm)) {
      searchClauses.push(`id.eq.${normalizedSearchTerm}`);
    }

    query = query.or(searchClauses.join(','));
  }

  if (sortBy === 'oldest') {
    query = query.order('created_at', { ascending: true });
  } else if (sortBy === 'name') {
    query = query.order('name', { ascending: true, nullsFirst: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const from = (Math.max(1, Number(page || 1)) - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);

  if (error) {
    throw error;
  }

  return {
    users: data || [],
    totalUsers: count || 0,
  };
}

export async function updateAdminUserRole(userId, role) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const { error } = await supabase.rpc('update_user_role', {
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    throw error;
  }
}
