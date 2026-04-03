const PARTY_DRAFT_PREFIX = 'moodtoon-party-draft';

export function readPartyDraft(storageKey) {
  if (typeof window === 'undefined' || !storageKey) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writePartyDraft(storageKey, draft) {
  if (typeof window === 'undefined' || !storageKey) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Ignore storage write failures.
  }
}

export function clearPartyDraft(storageKey) {
  if (typeof window === 'undefined' || !storageKey) {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function getPartyTemplateBuilderDraftKey({ editTemplateId = '', baseTemplateId = '' } = {}) {
  if (editTemplateId) {
    return `${PARTY_DRAFT_PREFIX}:template-builder:edit:${editTemplateId}`;
  }

  if (baseTemplateId) {
    return `${PARTY_DRAFT_PREFIX}:template-builder:clone:${baseTemplateId}`;
  }

  return `${PARTY_DRAFT_PREFIX}:template-builder:new`;
}

export function getPartyTitleGuessBuilderDraftKey() {
  return `${PARTY_DRAFT_PREFIX}:title-guess-builder:new`;
}

export function getPartyRoomSettingsDraftKey(roomCode = '') {
  const normalizedRoomCode = String(roomCode || '').trim().toUpperCase();
  return normalizedRoomCode
    ? `${PARTY_DRAFT_PREFIX}:room-settings:${normalizedRoomCode}`
    : '';
}
