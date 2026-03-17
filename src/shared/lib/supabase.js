import { createClient } from '@supabase/supabase-js';

// Environment variables from Vite
const VITE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback hardcoded values based on the .env file I read
// (Using fallbacks to ensure the app works even if Vite env fails to load)
const SUPABASE_URL = VITE_URL || 'https://ntwgbtaxsovsnafpvbkj.supabase.co';
const SUPABASE_ANON_KEY = VITE_KEY || 'sb_publishable_XtYX6GGbiAPGOS9QRLMisA_URDyjfJ_';

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_API_KEY'))
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storageKey: 'moodtoon-auth',
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (!supabase) {
  console.error('[Supabase] Client could not be initialized. Check environment variables.');
}

export const isSupabaseConnected = () => !!supabase;
