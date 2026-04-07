import { PARTY_AVATAR_OPTIONS } from '../lib/partyEngine.js';

const PARTY_GUEST_TOKEN_KEY = 'moodtoon-party-guest-token';
const PARTY_PROFILE_KEY = 'moodtoon-party-profile';

function makeId(prefix = 'party') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getMissingRelation(error, relationName) {
  const normalizedRelation = String(relationName || '').trim().toLowerCase();
  const statusCode = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0);
  const haystack = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.error_description,
    error?.response?.statusText,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return (
    statusCode === 404
    || haystack.includes(`"${normalizedRelation}"`)
    || haystack.includes(`'${normalizedRelation}'`)
    || haystack.includes(`public.${normalizedRelation}`)
    || (haystack.includes('schema cache') && haystack.includes(normalizedRelation))
    || (haystack.includes('relation') && haystack.includes(normalizedRelation) && haystack.includes('does not exist'))
  );
}

function getSafeLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getPartyBackendHint(error, pick) {
  if (
    getMissingRelation(error, 'party_rooms')
    || getMissingRelation(error, 'party_room_members')
    || getMissingRelation(error, 'party_room_answers')
  ) {
    return pick(
      'ฐานข้อมูลสำหรับ Music Guess Party ยังไม่พร้อม ให้รัน migration ก่อนแล้วลองใหม่',
      'Music Guess Party tables are not ready yet. Run the migration first, then try again.'
    );
  }

  return error?.message || pick('เกิดข้อผิดพลาดที่ไม่คาดคิด', 'Something unexpected went wrong.');
}

export function getPartyGuestToken() {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return makeId('party-guest');
  }

  const current = String(storage.getItem(PARTY_GUEST_TOKEN_KEY) || '').trim();
  if (current) {
    return current;
  }

  const next = makeId('party-guest');
  storage.setItem(PARTY_GUEST_TOKEN_KEY, next);
  return next;
}

export function readPartyProfile() {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return { displayName: '', avatarKey: PARTY_AVATAR_OPTIONS[0].id, avatarUrl: '' };
  }

  try {
    const parsed = JSON.parse(storage.getItem(PARTY_PROFILE_KEY) || '{}');
    return {
      displayName: String(parsed?.displayName || '').trim(),
      avatarKey: PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === parsed?.avatarKey)
        ? parsed.avatarKey
        : PARTY_AVATAR_OPTIONS[0].id,
      avatarUrl: String(parsed?.avatarUrl || '').trim(),
    };
  } catch {
    return { displayName: '', avatarKey: PARTY_AVATAR_OPTIONS[0].id, avatarUrl: '' };
  }
}

export function normalizePartyProfile(profile = {}, memberToken = '') {
  const stored = readPartyProfile();
  const fallbackDisplayName = stored.displayName || `Guest ${String(memberToken || '').slice(-4).toUpperCase() || 'PLAY'}`;

  return {
    displayName: String(profile.displayName || stored.displayName || fallbackDisplayName).trim(),
    avatarKey: PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === profile.avatarKey)
      ? profile.avatarKey
      : PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === stored.avatarKey)
        ? stored.avatarKey
        : PARTY_AVATAR_OPTIONS[0].id,
    avatarUrl: String(profile.avatarUrl || stored.avatarUrl || '').trim(),
  };
}

export function savePartyProfile(profile = {}) {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return;
  }

  const normalized = {
    displayName: String(profile.displayName || '').trim(),
    avatarKey: PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === profile.avatarKey)
      ? profile.avatarKey
      : PARTY_AVATAR_OPTIONS[0].id,
    avatarUrl: String(profile.avatarUrl || '').trim(),
  };

  storage.setItem(PARTY_PROFILE_KEY, JSON.stringify(normalized));
}
