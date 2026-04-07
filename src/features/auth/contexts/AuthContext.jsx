import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ensureAuthUserProfile,
  updateAuthUserProfile,
} from '@/features/auth/api';
import { supabase } from '@/shared/lib/supabase';

const AuthContext = createContext();

function mergeAuthUser(previousUser, nextAuthUser) {
  if (!nextAuthUser) {
    return null;
  }

  if (!previousUser || previousUser.id !== nextAuthUser.id) {
    return nextAuthUser;
  }

  return {
    ...previousUser,
    ...nextAuthUser,
    profile: previousUser.profile ?? nextAuthUser.profile,
  };
}

function parseOAuthHashSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = String(window.location.hash || '').replace(/^#/, '');
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

async function validateAuthSession(session) {
  if (!supabase || !session?.access_token) {
    return { session: null, user: null, error: null };
  }

  const { data, error } = await supabase.auth.getUser(session.access_token);
  if (error || !data?.user) {
    return { session: null, user: null, error: error || new Error('Invalid auth session') };
  }

  return {
    session,
    user: data.user,
    error: null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const hydrateUserProfile = useCallback(async (authUser) => {
    if (!authUser?.id || !supabase) {
      return null;
    }

    setIsProfileLoading(true);

    try {
      const profile = await ensureAuthUserProfile(authUser.id);
      setUser((prev) => {
        if (!prev || prev.id !== authUser.id) {
          return prev;
        }

        return { ...prev, profile };
      });
      return profile;
    } catch (error) {
      console.warn('Profile hydration error:', error);
      return null;
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      setIsProfileLoading(false);
      return;
    }

    const initializeAuth = async () => {
      try {
        // Fallback for OAuth hash callbacks when session detection misses on first paint.
        const oauthHashSession = parseOAuthHashSession();
        if (oauthHashSession) {
          const { error: setSessionError } = await supabase.auth.setSession(oauthHashSession);
          if (!setSessionError) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } else {
            console.warn('OAuth hash session restore failed:', setSessionError.message);
          }
        }

        const { data: { session: currentSession }, error } = await supabase.auth.getSession();

        if (error) {
          // Stale or invalid refresh token — clear local session silently
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }

        if (currentSession?.access_token) {
          const { session: validatedSession, user: validatedUser, error: validationError } = await validateAuthSession(currentSession);

          if (validationError || !validatedSession || !validatedUser) {
            await supabase.auth.signOut({ scope: 'local' });
            setSession(null);
            setUser(null);
            return;
          }

          setSession(validatedSession);
          setUser((prev) => mergeAuthUser(prev, validatedUser));
          setIsLoading(false);
          void hydrateUserProfile(validatedUser);
          return;
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        setUser((prev) => mergeAuthUser(prev, newSession.user));
        setIsLoading(false);
        void hydrateUserProfile(newSession.user);
      } else {
        setUser(null);
        setIsProfileLoading(false);
        setIsLoading(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, [hydrateUserProfile]);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Supabase client is not available');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user) {
      setUser((prev) => mergeAuthUser(prev, data.user));
      setSession(data.session);
      void hydrateUserProfile(data.user);
      return { ...data, user: data.user };
    }

    return data;
  }, [hydrateUserProfile]);

  const signUpWithEmail = useCallback(async (email, password, username) => {
    if (!supabase) throw new Error('Supabase client is not available');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw error;

    if (data.user) {
      setUser((prev) => mergeAuthUser(prev, data.user));
      setSession(data.session);
      void hydrateUserProfile(data.user);
      return { ...data, user: data.user };
    }

    return data;
  }, [hydrateUserProfile]);

  const signInWithProvider = useCallback(async (provider) => {
    if (!supabase) throw new Error('Supabase client is not available');

    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedProvider) {
      throw new Error('OAuth provider is required');
    }

    const redirectTo = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: normalizedProvider,
      options: { redirectTo },
    });

    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Supabase client is not available');

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
    setIsProfileLoading(false);
  }, []);

  const updateUserProfile = useCallback(async (updates) => {
    if (!user?.id || !supabase) throw new Error('User not available');

    const nextProfile = await updateAuthUserProfile(user.id, updates);
    if (!nextProfile) return user?.profile ?? null;

    setUser((prev) => prev ? { ...prev, profile: { ...(prev.profile || {}), ...nextProfile } } : prev);
    return nextProfile;
  }, [user]);

  const value = useMemo(() => ({
    user,
    session,
    isLoading,
    isProfileLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithProvider,
    signOut,
    updateUserProfile,
  }), [user, session, isLoading, isProfileLoading, signInWithEmail, signUpWithEmail, signInWithProvider, signOut, updateUserProfile]);

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
