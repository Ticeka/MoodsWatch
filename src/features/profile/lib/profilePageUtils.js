export const PROFILE_TYPE_LABELS = {
  anime: { en: 'Anime', th: 'อนิเมะ' },
  manga: { en: 'Manga', th: 'มังงะ' },
  manhwa: { en: 'Manhwa', th: 'มันฮวา' },
};

export const PROFILE_LENGTH_LABELS = {
  any: { th: 'ทุกความยาว', en: 'Any length' },
  short: { th: 'สั้น', en: 'Short only' },
  long: { th: 'ยาว', en: 'Long only' },
};

export const PROFILE_PROGRESS_LABELS = {
  untracked: { th: 'ยังไม่อยู่ในลิสต์', en: 'Untracked' },
  planned: { th: 'วางแผน', en: 'Planned' },
  watching: { th: 'กำลังดู', en: 'Watching' },
  reading: { th: 'กำลังอ่าน', en: 'Reading' },
  'on-hold': { th: 'พักไว้', en: 'On Hold' },
  completed: { th: 'จบแล้ว', en: 'Completed' },
  dropped: { th: 'ดรอป', en: 'Dropped' },
};

export const PROFILE_TOP_SECTION_COPY = {
  overviewTitle: { th: 'Top 5 ของฉัน', en: 'My Top 5' },
  overviewSubtitle: {
    th: 'แยกตามประเภท และดูได้ครบในที่เดียว',
    en: 'Split by format and visible together in one place.',
  },
  loading: { th: 'กำลังโหลด Top 5...', en: 'Loading Top 5...' },
  empty: { th: 'ยังไม่มีเรื่องใน Top 5', en: 'No titles pinned in your Top 5 yet.' },
  emptyHint: {
    th: 'แตะปุ่ม Top 5 (🏆) บนการ์ดเพื่อปัก/เอาออก',
    en: 'Tap the Top 5 trophy (🏆) button on a card to pin or remove it.',
  },
  sectionHint: {
    th: 'ลากเพื่อเปลี่ยนอันดับ',
    en: 'Drag to reorder.',
  },
  sectionEmptyTitle: {
    th: 'ชั้นนี้ยังว่าง',
    en: 'This shelf is empty',
  },
  sectionEmptyHint: {
    th: 'กดปุ่ม 🏆 บนการ์ดเพื่อเพิ่มเรื่องเข้า Top 5 หมวดนี้',
    en: 'Press the 🏆 button on any card to add titles to this shelf.',
  },
};

export const PROFILE_USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function uniqProfileIds(...values) {
  return [...new Set(values.flat().map(Number).filter(Boolean))];
}

export function formatProfileDate(value, locale, withTime = false) {
  if (!value) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat(
      locale,
      withTime
        ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' }
    ).format(new Date(value));
  } catch {
    return '-';
  }
}

export function formatProfileCommentDate(value, locale) {
  return formatProfileDate(value, locale, true);
}

export function normalizeProfileUsername(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}
