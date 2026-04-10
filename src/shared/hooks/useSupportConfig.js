import { useEffect, useState } from 'react';
import {
  DEFAULT_SUPPORT_CONFIG,
  readSupportConfig,
  SUPPORT_CONFIG_STORAGE_KEY,
  SUPPORT_CONFIG_UPDATED_EVENT,
} from '@/shared/config/support';

export function useSupportConfig() {
  const [config, setConfig] = useState(() => readSupportConfig());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncConfig = () => {
      setConfig(readSupportConfig());
    };

    const handleStorage = (event) => {
      if (!event.key || event.key === SUPPORT_CONFIG_STORAGE_KEY) {
        syncConfig();
      }
    };

    const handleCustomUpdate = (event) => {
      setConfig(event?.detail || readSupportConfig() || DEFAULT_SUPPORT_CONFIG);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SUPPORT_CONFIG_UPDATED_EVENT, handleCustomUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SUPPORT_CONFIG_UPDATED_EVENT, handleCustomUpdate);
    };
  }, []);

  return config;
}
