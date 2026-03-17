import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';

const AuthContext = createContext();

// In-flight dedup only — prevents duplicate concurrent DB requests
const profileRequestCache = new Map();

async function fetchUserProfile(userId) {
  if (!userId || !supabase) return null;

  if (profileRequestCache.has(userId)) {
    return profileRequestCache.get(userId);
  }

  const request = supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.warn('Error fetching user profile:', error.message);
        return null;
      }
      return data ?? null;
    })
    .finally(() => {
      profileRequestCache.delete(userId);
    });

  profileRequestCache.set(userId, request);
  return request;
}

async function ensureUserProfile(userId) {
  if (!userId || !supabase) return null;

  const profile = await fetchUserProfile(userId);
  if (profile) return profile;

  // First-time user — create profile record
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId }, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('Error creating user profile:', error.message);
    return null;
  }

  return data ?? { id: userId };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);

        if (currentSession?.user) {
          const profile = await ensureUserProfile(currentSession.user.id);
          setUser({ ...currentSession.user, profile });
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        const profile = await ensureUserProfile(newSession.user.id);
        setUser({ ...newSession.user, profile });
      } else {
        setUser(null);
      }

      setIsLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Supabase client is not available');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user) {
      const profile = await ensureUserProfile(data.user.id);
      const nextUser = { ...data.user, profile };
      setUser(nextUser);
      setSession(data.session);
      return { ...data, user: nextUser };
    }

    return data;
  }, []);

  const signUpWithEmail = useCallback(async (email, password, username) => {
    if (!supabase) throw new Error('Supabase client is not available');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw error;

    if (data.user) {
      const profile = await ensureUserProfile(data.user.id);
      const nextUser = { ...data.user, profile };
      setUser(nextUser);
      setSession(data.session);
      return { ...data, user: nextUser };
    }

    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Supabase client is not available');

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
  }, []);

  const updateUserProfile = useCallback(async (updates) => {
    if (!user?.id || !supabase) throw new Error('User not available');

    const payload = Object.fromEntries(
      Object.entries(updates || {}).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(payload).length === 0) return user?.profile ?? null;

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (error) throw error;

    const nextProfile = data ?? { ...(user.profile || {}), ...payload };
    setUser((prev) => prev ? { ...prev, profile: { ...(prev.profile || {}), ...nextProfile } } : prev);
    return nextProfile;
  }, [user]);

  const value = useMemo(() => ({
    user,
    session,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    updateUserProfile,
  }), [user, session, isLoading, signInWithEmail, signUpWithEmail, signOut, updateUserProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
