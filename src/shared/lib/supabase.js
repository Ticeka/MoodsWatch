import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function getSupabaseProjectRef(url) {
  try {
    return new URL(url).hostname.split('.')[0] || 'default';
  } catch {
    return 'default';
  }
}

export const SUPABASE_AUTH_STORAGE_KEY = `moodtoon-auth-${getSupabaseProjectRef(SUPABASE_URL)}`;

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_API_KEY'))
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (!supabase) {
  console.error('[Supabase] Client could not be initialized. Check environment variables.');
}

export const isSupabaseConnected = () => !!supabase;
