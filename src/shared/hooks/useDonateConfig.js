import { useEffect, useState } from 'react';
import {
  DEFAULT_DONATE_CONFIG,
  DONATE_CONFIG_STORAGE_KEY,
  DONATE_CONFIG_UPDATED_EVENT,
  readDonateConfig,
} from '@/shared/config/donate';
import { fetchDonateConfig } from '@/features/donate/api/donateApi';

export function useDonateConfig() {
  const [config, setConfig] = useState(() => readDonateConfig());

  useEffect(() => {
    // Fetch fresh config from Supabase on mount
    fetchDonateConfig().then(setConfig).catch(() => {});

    const syncConfig = () => setConfig(readDonateConfig());

    const handleStorage = (event) => {
      if (!event.key || event.key === DONATE_CONFIG_STORAGE_KEY) {
        syncConfig();
      }
    };

    const handleCustomUpdate = (event) => {
      setConfig(event?.detail || readDonateConfig() || DEFAULT_DONATE_CONFIG);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(DONATE_CONFIG_UPDATED_EVENT, handleCustomUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(DONATE_CONFIG_UPDATED_EVENT, handleCustomUpdate);
    };
  }, []);

  return config;
}
