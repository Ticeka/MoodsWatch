export const DONATE_CONFIG_STORAGE_KEY = 'moodswatch-donate-config';
export const DONATE_CONFIG_UPDATED_EVENT = 'moodswatch:donate-config-updated';

export const DEFAULT_DONATE_CONFIG = {
  enabled: false,
  receiverType: 'phone',
  receiverValue: '',
  receiverName: '',
  minAmount: 1,
  maxAmount: 100000,
  presetAmounts: [20, 50, 100, 300, 500],
  allowOpenAmount: true,
  campaignNameTh: 'สนับสนุน MoodsWatch',
  campaignNameEn: 'Support MoodsWatch',
  thankYouTh: 'ขอบคุณมาก ๆ เลยนะคะ',
  thankYouEn: 'Thank you so much!',
};

export function normalizeDonateConfig(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: s.enabled === true,
    receiverType: ['phone', 'national_id'].includes(s.receiverType) ? s.receiverType : DEFAULT_DONATE_CONFIG.receiverType,
    receiverValue: String(s.receiverValue || '').trim(),
    receiverName: String(s.receiverName || '').trim(),
    minAmount: Number(s.minAmount) > 0 ? Number(s.minAmount) : DEFAULT_DONATE_CONFIG.minAmount,
    maxAmount: Number(s.maxAmount) > 0 ? Number(s.maxAmount) : DEFAULT_DONATE_CONFIG.maxAmount,
    presetAmounts: Array.isArray(s.presetAmounts) ? s.presetAmounts.map(Number).filter(Boolean) : DEFAULT_DONATE_CONFIG.presetAmounts,
    allowOpenAmount: s.allowOpenAmount !== false,
    campaignNameTh: String(s.campaignNameTh || '').trim() || DEFAULT_DONATE_CONFIG.campaignNameTh,
    campaignNameEn: String(s.campaignNameEn || '').trim() || DEFAULT_DONATE_CONFIG.campaignNameEn,
    thankYouTh: String(s.thankYouTh || '').trim() || DEFAULT_DONATE_CONFIG.thankYouTh,
    thankYouEn: String(s.thankYouEn || '').trim() || DEFAULT_DONATE_CONFIG.thankYouEn,
  };
}

export function readDonateConfig() {
  if (typeof window === 'undefined') return DEFAULT_DONATE_CONFIG;
  try {
    const raw = window.localStorage.getItem(DONATE_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_DONATE_CONFIG;
    return normalizeDonateConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_DONATE_CONFIG;
  }
}

export function saveDonateConfigLocal(config) {
  const normalized = normalizeDonateConfig(config);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DONATE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(DONATE_CONFIG_UPDATED_EVENT, { detail: normalized }));
  }
  return normalized;
}
