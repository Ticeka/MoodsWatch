// MoodsWatch — Mood taxonomy (หัวใจของระบบ)
export const MOODS = [
  {
    id: 'light',
    name_th: 'เบาสมอง',
    name_en: 'Light-hearted',
    icon: '😄',
    color: '#fbbf24',
    description: 'ดูสบายๆ ไม่ต้องคิดเยอะ',
    tags: ['comedy', 'slice of life', 'school', 'wholesome', 'family'],
  },
  {
    id: 'funny',
    name_th: 'ตลก',
    name_en: 'Comedy',
    icon: '🤣',
    color: '#fb923c',
    description: 'ขำจนกลิ้ง หัวเราะหนักมาก',
    tags: ['comedy', 'parody', 'gag humor', 'slapstick'],
  },
  {
    id: 'healing',
    name_th: 'ฮีลใจ',
    name_en: 'Healing',
    icon: '🌸',
    color: '#f9a8d4',
    description: 'อบอุ่น สบายใจ ดูแล้วหายเหนื่อย',
    tags: ['iyashikei', 'slice of life', 'warm', 'relaxing', 'friendship'],
  },
  {
    id: 'dark',
    name_th: 'ดาร์ก',
    name_en: 'Dark',
    icon: '🖤',
    color: '#6b7280',
    description: 'หนัก ลึก โหดมืดหม่น',
    tags: ['psychological', 'thriller', 'horror', 'tragedy', 'gore'],
  },
  {
    id: 'romantic',
    name_th: 'โรแมนติก',
    name_en: 'Romantic',
    icon: '💕',
    color: '#f472b6',
    description: 'หวานฉ่ำ ใจเต้นแรง',
    tags: ['romance', 'drama', 'love triangle', 'shoujo'],
  },
  {
    id: 'thrilling',
    name_th: 'ลุ้น',
    name_en: 'Thrilling',
    icon: '😰',
    color: '#ef4444',
    description: 'ตื่นเต้น ลุ้นทุกวินาที',
    tags: ['thriller', 'suspense', 'mystery', 'survival'],
  },
  {
    id: 'hype',
    name_th: 'มันส์',
    name_en: 'Hype',
    icon: '🔥',
    color: '#f97316',
    description: 'มันส์จัด แอ็กชันโหด ดูแล้วขนลุก',
    tags: ['action', 'battle', 'shounen', 'strategy'],
  },
  {
    id: 'op-mc',
    name_th: 'พระเอกโหด',
    name_en: 'OP Hero',
    icon: '⚡',
    color: '#a78bfa',
    description: 'พระเอกแกร่งสุดๆ ดูแล้วสะใจ',
    tags: ['overpowered mc', 'power fantasy'],
    matchMode: 'explicit',
  },
  {
    id: 'slowlife',
    name_th: 'Slow Life',
    name_en: 'Slow Life',
    icon: '🍃',
    color: '#34d399',
    description: 'ใช้ชีวิตช้าๆ สโลว์ไลฟ์',
    tags: ['slice of life', 'iyashikei', 'rural', 'farming'],
  },
  {
    id: 'sad',
    name_th: 'เศร้า',
    name_en: 'Sad',
    icon: '😢',
    color: '#60a5fa',
    description: 'ซึ้ง น้ำตาซึม จับใจ',
    tags: ['drama', 'tragedy', 'tearjerker', 'emotional'],
  },
  {
    id: 'mystery',
    name_th: 'ลึกลับ',
    name_en: 'Mystery',
    icon: '🔍',
    color: '#8b5cf6',
    description: 'ปริศนา ไขคดี ชวนคิด',
    tags: ['mystery', 'detective', 'crime', 'puzzle'],
  },
  {
    id: 'serious',
    name_th: 'จริงจัง',
    name_en: 'Serious',
    icon: '🎭',
    color: '#475569',
    description: 'เรื่องราวหนักแน่น คมลึก',
    tags: ['drama', 'psychological', 'political', 'war', 'seinen'],
  },
  {
    id: 'coming-of-age',
    name_th: 'เติบโต',
    name_en: 'Growing Up',
    icon: '🌅',
    color: '#f59e0b',
    description: 'เติบโต เรียนรู้ด้วยวัย',
    tags: ['coming of age', 'school', 'youth', 'growing up'],
  },
  {
    id: 'fantasy-escape',
    name_th: 'Fantasy',
    name_en: 'Fantasy',
    icon: '🏰',
    color: '#c084fc',
    description: 'หนีไปโลกแฟนตาซี ผจญภัยข้ามโลก',
    tags: ['fantasy', 'isekai', 'adventure', 'magic', 'world-building'],
  },
  {
    id: 'bedtime',
    name_th: 'ก่อนนอน',
    name_en: 'Bedtime',
    icon: '🌙',
    color: '#818cf8',
    description: 'สบายๆ อ่านในผ้าห่ม',
    tags: ['slice of life', 'wholesome', 'relaxing', 'short chapters'],
  },
  {
    id: 'quick-finish',
    name_th: 'จบไว',
    name_en: 'Quick',
    icon: '⏱️',
    color: '#14b8a6',
    description: 'จบเร็ว ไม่กี่ตอน ดูรวดเดียวจบ',
    tags: ['1 cour', 'movie', 'completed', 'low commitment'],
  },
  // ─── Adult / 18+ moods (manhwa-focused) ───────────────────────────────────
  {
    id: 'adult-ecchi',
    name_th: 'เอ็กจิ',
    name_en: 'Ecchi',
    icon: '🔥',
    color: '#f43f5e',
    description: 'มีเนื้อหาผู้ใหญ่เบา ๆ แบบ ecchi',
    tags: ['ecchi', 'fanservice', 'mature', 'adult'],
    matchMode: 'explicit',
    isAdult: true,
  },
  {
    id: 'adult-harem',
    name_th: 'ฮาเร็ม',
    name_en: 'Harem',
    icon: '💞',
    color: '#ec4899',
    description: 'พระเอกล้อมรอบด้วยตัวละครหลายคน ฮาเร็มสไตล์',
    tags: ['harem', 'reverse harem', 'romance', 'ecchi', 'mature'],
    matchMode: 'explicit',
    isAdult: true,
  },
  {
    id: 'adult-romance',
    name_th: 'โรแมนส์ผู้ใหญ่',
    name_en: 'Mature Romance',
    icon: '💋',
    color: '#db2777',
    description: 'โรแมนซ์เข้มข้น เนื้อหาผู้ใหญ่เต็ม ๆ',
    tags: ['mature romance', 'adult', 'smut', 'drama', 'manhwa'],
    matchMode: 'explicit',
    isAdult: true,
  },
  {
    id: 'adult-dark',
    name_th: 'ดาร์กผู้ใหญ่',
    name_en: 'Mature Dark',
    icon: '⛓️',
    color: '#7c3aed',
    description: 'เนื้อหาหนัก ดาร์ก ซับซ้อนสำหรับผู้ใหญ่',
    tags: ['mature', 'adult', 'psychological', 'dark', 'violence', 'gore', 'tragedy'],
    matchMode: 'explicit',
    isAdult: true,
  },
];

export const MOOD_BY_ID = Object.fromEntries(MOODS.map((mood) => [mood.id, mood]));

export function isExplicitMood(moodId) {
  return MOOD_BY_ID[moodId]?.matchMode === 'explicit';
}

export function getAutoDerivableMoods() {
  return MOODS.filter((mood) => mood.matchMode !== 'explicit');
}

export function getLocalizedLabel(item, language = 'th', thKey = 'label', enKey = 'labelEn') {
  if (!item) {
    return '';
  }

  return language === 'th'
    ? item[thKey] ?? item[enKey] ?? ''
    : item[enKey] ?? item[thKey] ?? '';
}

export function getLocalizedMoodName(mood, language = 'th') {
  if (!mood) {
    return '';
  }

  return language === 'th' ? mood.name_th : mood.name_en;
}

export const TIME_OPTIONS = [
  { id: 'completed', label: 'จบแล้ว', labelEn: 'Completed', status: 'completed', icon: '✅' },
  { id: 'ongoing', label: 'ยังไม่จบ', labelEn: 'Ongoing', status: 'ongoing', icon: '🔄' },
];

export const TYPE_OPTIONS = [
  { id: 'all', label: 'ทั้งหมด', labelEn: 'All', icon: '🎯' },
  { id: 'anime', label: 'Anime', labelEn: 'Anime', icon: '📺' },
  { id: 'manga', label: 'Manga', labelEn: 'Manga', countryCode: 'JP' },
  { id: 'manhwa', label: 'Manhwa', labelEn: 'Manhwa', countryCode: 'KR' },
];

export const FILTER_OPTIONS = {
  status: [
    { id: 'all', label: 'ทุกสถานะ' },
    { id: 'completed', label: 'จบแล้ว' },
    { id: 'ongoing', label: 'ยังไม่จบ' },
  ],
  scoreMin: [
    { id: 0, label: 'ทุกคะแนน' },
    { id: 60, label: '60+' },
    { id: 70, label: '70+' },
    { id: 80, label: '80+' },
    { id: 85, label: '85+' },
    { id: 90, label: '90+' },
  ],
  excludes: [
    { id: 'no-violence', label: 'ไม่เอาเนื้อหารุนแรง', genres: ['gore', 'horror'] },
    { id: 'no-romance', label: 'ไม่เอาโรแมนติก', genres: ['romance'] },
    { id: 'no-sad', label: 'ไม่เอาเศร้า', genres: ['tragedy', 'tearjerker'] },
  ],
};

export const LIST_STATUS_OPTIONS = [
  { id: 'planned', label: 'วางแผนจะดู', labelEn: 'Planned', icon: '📋', color: '#818cf8' },
  { id: 'watching', label: 'กำลังดู', labelEn: 'Watching', icon: '▶️', color: '#34d399' },
  { id: 'reading', label: 'กำลังอ่าน', labelEn: 'Reading', icon: '📖', color: '#60a5fa' },
  { id: 'completed', label: 'ดู/อ่านจบแล้ว', labelEn: 'Completed', icon: '✅', color: '#10b981' },
  { id: 'dropped', label: 'ดรอป', labelEn: 'Dropped', icon: '❌', color: '#ef4444' },
  { id: 'on-hold', label: 'พักไว้ก่อน', labelEn: 'On Hold', icon: '⏸️', color: '#f59e0b' },
];

export const RANDOM_MODES = [
  { id: 'any', label: 'สุ่มมัว', labelEn: 'Truly random', icon: '🎲' },
  { id: 'by-mood', label: 'สุ่มตาม mood', labelEn: 'By mood', icon: '🎭' },
  { id: 'short', label: 'สุ่มเฉพาะเรื่องสั้น', labelEn: 'Short only', icon: '⏱️' },
  { id: 'popular', label: 'สุ่มเฉพาะเรื่องดัง', labelEn: 'Popular only', icon: '⭐' },
  { id: 'underrated', label: 'สุ่มเรื่อง underrated', labelEn: 'Underrated gems', icon: '💎' },
  { id: 'from-list', label: 'สุ่มจาก watchlist', labelEn: 'From my list', icon: '📋' },
];
