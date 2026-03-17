import { useCallback, useMemo } from 'react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  extractProfilePreferences,
  loadStoredProfilePreferences,
  normalizeProfilePreferences,
  saveStoredProfilePreferences,
  toProfilePreferencesUpdates,
} from '@/features/profile/lib/profileStore';

export function useProfilePreferences() {
  const { user, updateUserProfile } = useAuth();
  const userId = user?.id || null;
  const profile = user?.profile || null;
  const stored = useMemo(() => loadStoredProfilePreferences(userId), [userId]);
  const remote = useMemo(() => extractProfilePreferences(profile), [profile]);
  const prefs = useMemo(
    () => (userId
      ? normalizeProfilePreferences({ ...stored, ...remote })
      : stored),
    [userId, stored, remote]
  );

  const savePreferences = useCallback(async (nextPreferences = prefs) => {
    const normalized = normalizeProfilePreferences(nextPreferences);
    saveStoredProfilePreferences(userId, normalized);

    if (!userId) {
      return normalized;
    }

    await updateUserProfile(toProfilePreferencesUpdates(normalized));
    return normalized;
  }, [prefs, updateUserProfile, userId]);

  return useMemo(() => ({
    prefs,
    isReady: true,
    savePreferences,
  }), [prefs, savePreferences]);
}
