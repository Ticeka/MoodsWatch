export const SUPPORT_STRIPE_COFFEE_URL = String(import.meta.env.VITE_STRIPE_COFFEE_URL || '').trim();

export const SUPPORT_MODAL_DELAY_MS = 75 * 1000;
export const SUPPORT_MODAL_DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const SUPPORT_MODAL_DONATED_COOLDOWN_MS = 45 * 24 * 60 * 60 * 1000;

export const SUPPORT_MODAL_DISMISSED_AT_KEY = 'moodswatch-support-modal-dismissed-at';
export const SUPPORT_MODAL_DONATED_AT_KEY = 'moodswatch-support-modal-donated-at';
export const SUPPORT_CONFIG_STORAGE_KEY = 'moodswatch-support-config';
export const SUPPORT_CONFIG_UPDATED_EVENT = 'moodswatch:support-config-updated';
export const SUPPORT_MODAL_OPEN_EVENT = 'moodswatch:support-modal-open';

export const DEFAULT_SUPPORT_CONFIG = {
  enabled: true,
  modalDelayMs: SUPPORT_MODAL_DELAY_MS,
  kickerTh: 'มุมขอกำลังใจเล็ก ๆ',
  kickerEn: 'A tiny support corner',
  titleTh: 'อยู่เป็นเพื่อนเรามาสักพักแล้ว...',
  titleEn: 'You have been hanging out with us for a while...',
  bodyTh: 'MoodsWatch กำลังพยายามเป็นเว็บที่น่ารักและใช้งานสบายขึ้นทุกวัน ถ้าอยากช่วยค่ากาแฟเล็ก ๆ ผ่าน Stripe เราจะดีใจมาก',
  bodyEn: 'MoodsWatch is trying to stay cute, cozy, and a little better every day. If you want to chip in for a tiny coffee through Stripe, it would mean a lot.',
  primaryCtaTh: 'เลี้ยงกาแฟให้ทีมหน่อย',
  primaryCtaEn: 'Buy us a coffee',
  secondaryCtaTh: 'ไว้ก่อน เดี๋ยวกลับมา',
  secondaryCtaEn: 'Maybe later',
  footerLabelTh: 'เลี้ยงกาแฟให้เรา',
  footerLabelEn: 'Buy us a coffee',
  footerHintTh: 'ช่วยให้เว็บน่ารักต่อได้อีกนิด',
  footerHintEn: 'Help keep the cute features coming',
  menuLabelTh: 'เลี้ยงกาแฟให้เรา',
  menuLabelEn: 'Buy us a coffee',
  profileLabelTh: 'เลี้ยงกาแฟให้เราหน่อย',
  profileLabelEn: 'Buy us a tiny coffee',
  guestHintTh: 'น่ารักเนอะ',
  guestHintEn: 'so sweet',
};

function clampDelayMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SUPPORT_CONFIG.modalDelayMs;
  }
  return Math.min(15 * 60 * 1000, Math.max(5 * 1000, Math.round(numeric)));
}

function normalizeText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function normalizeSupportConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled !== false,
    modalDelayMs: clampDelayMs(source.modalDelayMs),
    kickerTh: normalizeText(source.kickerTh, DEFAULT_SUPPORT_CONFIG.kickerTh),
    kickerEn: normalizeText(source.kickerEn, DEFAULT_SUPPORT_CONFIG.kickerEn),
    titleTh: normalizeText(source.titleTh, DEFAULT_SUPPORT_CONFIG.titleTh),
    titleEn: normalizeText(source.titleEn, DEFAULT_SUPPORT_CONFIG.titleEn),
    bodyTh: normalizeText(source.bodyTh, DEFAULT_SUPPORT_CONFIG.bodyTh),
    bodyEn: normalizeText(source.bodyEn, DEFAULT_SUPPORT_CONFIG.bodyEn),
    primaryCtaTh: normalizeText(source.primaryCtaTh, DEFAULT_SUPPORT_CONFIG.primaryCtaTh),
    primaryCtaEn: normalizeText(source.primaryCtaEn, DEFAULT_SUPPORT_CONFIG.primaryCtaEn),
    secondaryCtaTh: normalizeText(source.secondaryCtaTh, DEFAULT_SUPPORT_CONFIG.secondaryCtaTh),
    secondaryCtaEn: normalizeText(source.secondaryCtaEn, DEFAULT_SUPPORT_CONFIG.secondaryCtaEn),
    footerLabelTh: normalizeText(source.footerLabelTh, DEFAULT_SUPPORT_CONFIG.footerLabelTh),
    footerLabelEn: normalizeText(source.footerLabelEn, DEFAULT_SUPPORT_CONFIG.footerLabelEn),
    footerHintTh: normalizeText(source.footerHintTh, DEFAULT_SUPPORT_CONFIG.footerHintTh),
    footerHintEn: normalizeText(source.footerHintEn, DEFAULT_SUPPORT_CONFIG.footerHintEn),
    menuLabelTh: normalizeText(source.menuLabelTh, DEFAULT_SUPPORT_CONFIG.menuLabelTh),
    menuLabelEn: normalizeText(source.menuLabelEn, DEFAULT_SUPPORT_CONFIG.menuLabelEn),
    profileLabelTh: normalizeText(source.profileLabelTh, DEFAULT_SUPPORT_CONFIG.profileLabelTh),
    profileLabelEn: normalizeText(source.profileLabelEn, DEFAULT_SUPPORT_CONFIG.profileLabelEn),
    guestHintTh: normalizeText(source.guestHintTh, DEFAULT_SUPPORT_CONFIG.guestHintTh),
    guestHintEn: normalizeText(source.guestHintEn, DEFAULT_SUPPORT_CONFIG.guestHintEn),
  };
}

export function readSupportConfig() {
  if (typeof window === 'undefined') {
    return DEFAULT_SUPPORT_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(SUPPORT_CONFIG_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SUPPORT_CONFIG;
    }
    return normalizeSupportConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_SUPPORT_CONFIG;
  }
}

function emitSupportConfigUpdated(config) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(SUPPORT_CONFIG_UPDATED_EVENT, { detail: config }));
}

export function saveSupportConfig(config) {
  const normalized = normalizeSupportConfig(config);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SUPPORT_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    emitSupportConfigUpdated(normalized);
  }
  return normalized;
}

export function resetSupportConfig() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SUPPORT_CONFIG_STORAGE_KEY);
    emitSupportConfigUpdated(DEFAULT_SUPPORT_CONFIG);
  }
  return DEFAULT_SUPPORT_CONFIG;
}
