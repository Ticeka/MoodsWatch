import { supabase } from '@/shared/lib/supabase';

const TIERLIST_IMAGE_BUCKET = 'tierlist-images';

function buildTierlistImagePath(userId, file, prefix = 'image') {
  const ext = String(file?.name || 'jpg').split('.').pop() || 'jpg';
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${userId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
}

export async function uploadTierlistImage(file, userId, prefix = 'image') {
  if (!supabase || !userId || !file) {
    throw new Error('Invalid image upload request');
  }

  const path = buildTierlistImagePath(userId, file, prefix);
  const { error } = await supabase.storage
    .from(TIERLIST_IMAGE_BUCKET)
    .upload(path, file, { cacheControl: '31536000', upsert: false });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(TIERLIST_IMAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Image upload did not return a public URL');
  }

  return `${data.publicUrl}?t=${Date.now()}`;
}

export function getTierItemTitleFromFilename(fileName, pick) {
  const rawName = String(fileName || '').replace(/\.[^.]+$/, '').trim();
  if (!rawName) {
    return pick('รูปที่อัปโหลด', 'Uploaded image');
  }

  return rawName.replace(/[_-]+/g, ' ').trim() || pick('รูปที่อัปโหลด', 'Uploaded image');
}
