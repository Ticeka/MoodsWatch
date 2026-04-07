import { supabase } from '@/shared/lib/supabase';

export async function fetchUserProfile(userId) {
  if (!userId || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function upsertUserProfile(userId, updates) {
  if (!userId || !supabase) {
    throw new Error('User is not available');
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, ...updates }, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || updates;
}

export async function uploadUserProfileAvatar(userId, file) {
  if (!userId || !file || !supabase) {
    throw new Error('Avatar upload is not available');
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `avatar-${Date.now()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const avatarUrl = publicUrlData?.publicUrl ? `${publicUrlData.publicUrl}?t=${Date.now()}` : '';
  if (!avatarUrl) {
    throw new Error('Could not resolve avatar URL');
  }

  const data = await upsertUserProfile(userId, { avatar_url: avatarUrl });
  return { data, avatarUrl };
}
