import { PARTY_AVATAR_OPTIONS } from '../lib/partyEngine.js';

const PARTY_AUDIO_VOLUME_KEY = 'moodtoon-party-audio-volume';

export function readPartyAudioVolume() {
  if (typeof window === 'undefined') {
    return 85;
  }

  const raw = Number(window.localStorage.getItem(PARTY_AUDIO_VOLUME_KEY));
  if (!Number.isFinite(raw)) {
    return 85;
  }

  return Math.min(100, Math.max(0, raw));
}

export function getCountdownSeconds(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }

  return Math.ceil(ms / 1000);
}

export function formatCountdown(ms, pick) {
  const seconds = getCountdownSeconds(ms);
  return pick(`${seconds} วินาที`, `${seconds}s`);
}

export function formatFastest(ms, pick) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return pick('ยังไม่มี', '—');
  }

  return pick(`${(ms / 1000).toFixed(2)} วิ`, `${(ms / 1000).toFixed(2)}s`);
}

export function formatClipSeconds(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0.0s';
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

export function getPartyBufferedPreviewMs(
  ranges = [],
  currentSec = 0,
  startSec = 0,
  previewDurationMs = 0
) {
  if (!Array.isArray(ranges) || previewDurationMs <= 0) {
    return 0;
  }

  const previewEndSec = startSec + (previewDurationMs / 1000);
  const targetSec = Math.max(startSec, Number(currentSec || 0));

  for (const range of ranges) {
    const rangeStart = Number(range?.[0] || 0);
    const rangeEnd = Number(range?.[1] || 0);
    if (rangeStart > targetSec || rangeEnd < targetSec) {
      continue;
    }

    return Math.max(0, (Math.min(previewEndSec, rangeEnd) - targetSec) * 1000);
  }

  return 0;
}

export function getPartyPlaybackLeadBufferMs(previewDurationMs = 0) {
  if (!Number.isFinite(previewDurationMs) || previewDurationMs <= 0) {
    return 0;
  }

  return Math.max(400, Math.min(1400, Math.round(previewDurationMs * 0.12)));
}

export function isPartyPlaybackReady({
  bufferedPreviewMs = 0,
  previewDurationMs = 0,
  readyState = 0,
} = {}) {
  if (Number(readyState || 0) >= 2) {
    return true;
  }

  return Number(bufferedPreviewMs || 0) >= getPartyPlaybackLeadBufferMs(previewDurationMs);
}

export function getPartyPrefetchRound(match, { revealPrefetchReady = false } = {}) {
  if (!match || !Array.isArray(match.rounds)) {
    return null;
  }

  const currentRoundIndex = Math.max(0, Number(match.roundIndex || 0));
  const currentRound = match.rounds[currentRoundIndex] || null;
  const nextRound = match.rounds[currentRoundIndex + 1] || null;

  if (match.phase === 'countdown') {
    return currentRound;
  }

  if (match.phase === 'reveal' && revealPrefetchReady) {
    return nextRound;
  }

  return null;
}

export function getPartyPrefetchPreloadValue(phase = '') {
  return phase === 'countdown' || phase === 'reveal' ? 'auto' : 'metadata';
}

export function shouldPartyForceMediaLoad(currentSrc = '', targetSrc = '', readyState = 0) {
  const normalizedCurrentSrc = String(currentSrc || '').trim();
  const normalizedTargetSrc = String(targetSrc || '').trim();

  if (!normalizedTargetSrc) {
    return false;
  }

  if (!normalizedCurrentSrc || normalizedCurrentSrc !== normalizedTargetSrc) {
    return true;
  }

  return Number(readyState || 0) <= 1;
}

export function playPartyCountdownAlert(audioContext, volume = 85, step = 3) {
  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  const accent = Math.max(0, Math.min(1, normalizedVolume * 1.215));
  const targetStep = Math.max(1, Number(step) || 1);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(targetStep === 1 ? 1120 : targetStep === 2 ? 980 : 860, now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, accent), now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

export function playPartyClashAlert(audioContext, volume = 85) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const oscillator2 = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(150, now);
  oscillator.frequency.exponentialRampToValueAtTime(40, now + 0.3);

  oscillator2.type = 'square';
  oscillator2.frequency.setValueAtTime(200, now);
  oscillator2.frequency.exponentialRampToValueAtTime(60, now + 0.3);

  gainNode.gain.setValueAtTime(normalizedVolume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  oscillator.connect(gainNode);
  oscillator2.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator2.start(now);
  oscillator.stop(now + 0.3);
  oscillator2.stop(now + 0.3);
}

export function playPartyWinAlert(audioContext, volume = 85) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);       // A4
  osc.frequency.setValueAtTime(554.37, now + 0.1); // C#5
  osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
  osc.frequency.setValueAtTime(880, now + 0.3);    // A5
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(normalizedVolume, now + 0.05);
  gain.gain.setValueAtTime(normalizedVolume, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.8);
}

function getAvatarTone(avatarKey) {
  return PARTY_AVATAR_OPTIONS.find((avatar) => avatar.id === avatarKey)?.tone || PARTY_AVATAR_OPTIONS[0].tone;
}

function hashPartySeed(value = '') {
  return Array.from(String(value || '')).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getPartyProfileName(user, savedProfile) {
  return String(
    user?.profile?.name
    || user?.profile?.username
    || user?.email?.split('@')[0]
    || savedProfile?.displayName
    || 'Guest'
  ).trim();
}

function getPartyProfileAvatarKey(user, savedProfile) {
  if (user?.id || user?.profile?.username || user?.profile?.name || user?.email) {
    const seed = user?.id || user?.profile?.username || user?.profile?.name || user?.email || '';
    return PARTY_AVATAR_OPTIONS[hashPartySeed(seed) % PARTY_AVATAR_OPTIONS.length]?.id || PARTY_AVATAR_OPTIONS[0].id;
  }

  if (PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === savedProfile?.avatarKey)) {
    return savedProfile.avatarKey;
  }

  return PARTY_AVATAR_OPTIONS[0].id;
}

export function buildPartyProfile(user, savedProfile) {
  return {
    displayName: getPartyProfileName(user, savedProfile),
    avatarKey: getPartyProfileAvatarKey(user, savedProfile),
    avatarUrl: String(user?.profile?.avatar_url || '').trim(),
  };
}

export function buildHydratedPartyMembers(members = [], guestToken = '', partyProfile = {}) {
  return members.map((member) => {
    if (String(member.member_token || '') !== String(guestToken || '')) {
      return member;
    }

    return {
      ...member,
      avatar_url: member.avatar_url || partyProfile.avatarUrl || '',
      display_name: member.display_name || partyProfile.displayName || member.display_name,
    };
  });
}

export function getPartyAvatarTone(avatarKey) {
  return getAvatarTone(avatarKey);
}
