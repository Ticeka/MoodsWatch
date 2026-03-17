import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';

const AuthContext = createContext();
const PROFILE_FETCH_TIMEOUT_MS = 2500;
const profileCache = new Map();
const profileRequestCache = new Map();
const PROFILE_CACHE_KEY = 'moodtoon-profile-cache';

function loadStoredProfiles() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredProfiles() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const serialized = JSON.stringify(Object.fromEntries(profileCache.entries()));
    window.localStorage.setItem(PROFILE_CACHE_KEY, serialized);
  } catch {
    // Ignore storage failures
  }
}

function primeProfileCache() {
  const storedProfiles = loadStoredProfiles();
  Object.entries(storedProfiles).forEach(([userId, profile]) => {
    profileCache.set(userId, profile);
  });
}

function getCachedProfile(userId) {
  if (!userId) {
    return null;
  }

  return profileCache.get(userId) ?? null;
}

function cacheProfile(userId, profile) {
  if (!userId || !profile) {
    return;
  }

  profileCache.set(userId, profile);
  saveStoredProfiles();
}

function attachCachedProfile(user) {
  if (!user) {
    return null;
  }

  const cachedProfile = getCachedProfile(user.id);
  if (!cachedProfile) {
    return user;
  }

  return { ...user, profile: cachedProfile };
}

function hasAttachedProfile(user) {
  return Boolean(user?.profile?.role);
}

function mergeProfileIntoUser(user, profile) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    profile: {
      ...(user.profile || {}),
      ...(profile || {}),
    },
  };
}

async function fetchUserProfile(userId) {
  if (!userId || !supabase) {
    return null;
  }

  const cachedProfile = getCachedProfile(userId);
  if (cachedProfile) {
    return cachedProfile;
  }

  if (profileRequestCache.has(userId)) {
    return profileRequestCache.get(userId);
  }

  const request = (async () => {
    const query = supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('User profile fetch timeout')), PROFILE_FETCH_TIMEOUT_MS);
    });

    try {
      const { data: profile, error } = await Promise.race([query, timeoutPromise]);

      if (error) {
        console.warn('Error fetching user profile:', error.message);
        return null;
      }

      return profile ?? null;
    } catch (error) {
      console.warn('Error fetching user profile:', error.message);
      return null;
    } finally {
      profileRequestCache.delete(userId);
    }
  })();

  profileRequestCache.set(userId, request);
  return request;
}

async function ensureUserProfileRecord(user) {
  if (!user?.id || !supabase) {
    return null;
  }

  const existingProfile = await fetchUserProfile(user.id);
  if (existingProfile) {
    cacheProfile(user.id, existingProfile);
    return existingProfile;
  }

  const profilePayload = {
    id: user.id,
  };

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('Error ensuring user profile:', error.message);
    return null;
  }

  const profile = data || profilePayload;
  cacheProfile(user.id, profile);
  return profile;
}

async function enrichUserWithProfile(user) {
  if (!user) {
    return null;
  }

  const profile = await ensureUserProfileRecord(user);
  if (!profile) {
    return user;
  }

  return { ...user, profile };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    primeProfileCache();

    if (!supabase) {
      console.warn('Supabase client is null, skipping auth initialization');
      setIsLoading(false);
      return;
    }

    // Safety timeout - absolute limit for auth check
    const timeout = setTimeout(() => {
      console.warn('Auth context initialization timeout');
      setIsLoading(false);
    }, 5000);

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        
        let currentUser = currentSession?.user ?? null;
        if (currentUser) {
          currentUser = attachCachedProfile(currentUser);
          setUser(currentUser);
          currentUser = await enrichUserWithProfile(currentUser);
        }
        
        setUser(currentUser);
      } catch (err) {
        console.error('Critical auth initialization error:', err);
      } finally {
        setIsLoading(false);
        clearTimeout(timeout);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      
      let currentUser = newSession?.user ?? null;
      if (currentUser) {
        currentUser = attachCachedProfile(currentUser);
        if (hasAttachedProfile(currentUser)) {
          setUser(currentUser);
          setIsLoading(false);
        }
        currentUser = await enrichUserWithProfile(currentUser);
      } else {
        setUser(null);
      }
      
      setUser(currentUser);
      setIsLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!supabase) {
      throw new Error('Supabase client is not available');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    let nextUser = data.user ? attachCachedProfile(data.user) : null;
    if (nextUser && !hasAttachedProfile(nextUser)) {
      nextUser = await enrichUserWithProfile(nextUser);
    }

    if (data.session) {
      setSession(data.session);
    }
    if (nextUser) {
      setUser(nextUser);
    }

    return { ...data, user: nextUser };
  }, []);

  const signUpWithEmail = useCallback(async (email, password, username) => {
    if (!supabase) {
      throw new Error('Supabase client is not available');
    }

    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          username: username
        }
      }
    });
    if (error) throw error;

    let nextUser = data.user ? attachCachedProfile(data.user) : null;
    if (nextUser && !hasAttachedProfile(nextUser)) {
      nextUser = await enrichUserWithProfile(nextUser);
    }
    
    if (data.session) {
      setSession(data.session);
    }
    if (nextUser) {
      setUser(nextUser);
    }

    return { ...data, user: nextUser };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      throw new Error('Supabase client is not available');
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
  }, []);

  const updateUserProfile = useCallback(async (updates) => {
    if (!user?.id || !supabase) {
      throw new Error('User profile is not available');
    }

    const payload = Object.fromEntries(
      Object.entries(updates || {}).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(payload).length === 0) {
      return user?.profile || null;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        ...payload,
      }, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (error) throw error;

    const nextProfile = data || { ...(user.profile || {}), ...payload };
    cacheProfile(user.id, nextProfile);
    setUser((currentUser) => mergeProfileIntoUser(currentUser, nextProfile));
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
