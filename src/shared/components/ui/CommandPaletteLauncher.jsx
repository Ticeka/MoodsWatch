import React from 'react';
import { useDiscoverSavedSearches } from '@/features/discover/hooks/useDiscoverSavedSearches';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { CommandPalette } from '@/shared/components/ui/CommandPalette';

export function CommandPaletteLauncher({ isOpen, onClose }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { savedSearches } = useDiscoverSavedSearches(t);

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      userId={user?.id || null}
      savedSearches={savedSearches}
    />
  );
}
