const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PARTY_ANSWER_GRACE_SEC = 3;

export const PARTY_PRESETS = [
  {
    id: 'party-classic',
    label: 'Party Classic',
    labelTh: 'Party Classic',
    description: 'Listen to a clip and guess the source title from 4 choices.',
    descriptionTh: 'ฟังคลิปแล้วทายชื่อเรื่องจาก 4 ตัวเลือก',
    answerMode: 'choice',
    target: 'title',
    basePoints: 100,
    speedBonus: 60,
  },
  {
    id: 'song-typing',
    label: 'Song Typing',
    labelTh: 'Song Typing',
    description: 'Type the song title before the timer runs out.',
    descriptionTh: 'พิมพ์ชื่อเพลงให้ทันก่อนหมดเวลา',
    answerMode: 'typing',
    target: 'song',
    basePoints: 180,
    speedBonus: 70,
  },
  {
    id: 'full-recall',
    label: 'Full Recall',
    labelTh: 'Full Recall',
    description: 'Type both the title and the song name for a perfect round.',
    descriptionTh: 'พิมพ์ทั้งชื่อเรื่องและชื่อเพลงให้ครบ',
    answerMode: 'dual',
    target: 'title_song',
    basePoints: 0,
    speedBonus: 90,
  },
];

export const PARTY_CATEGORY_OPTIONS = [
  { id: 'all', label: 'All Songs', labelTh: 'รวมทุกเพลง' },
  { id: 'op', label: 'Openings Only', labelTh: 'เฉพาะเพลงเปิด' },
  { id: 'ed', label: 'Endings Only', labelTh: 'เฉพาะเพลงปิด' },
  { id: 'creditless', label: 'Creditless Picks', labelTh: 'เน้นเวอร์ชัน creditless' },
];

export const PARTY_AVATAR_OPTIONS = [
  { id: 'rose', label: 'Rose', labelTh: 'กุหลาบ', tone: 'rose' },
  { id: 'apricot', label: 'Apricot', labelTh: 'แอปริคอต', tone: 'apricot' },
  { id: 'gold', label: 'Gold', labelTh: 'ทองอุ่น', tone: 'gold' },
  { id: 'mint', label: 'Mint', labelTh: 'มิ้นต์', tone: 'mint' },
  { id: 'sky', label: 'Sky', labelTh: 'ฟ้าใส', tone: 'sky' },
  { id: 'violet', label: 'Violet', labelTh: 'ไวโอเลต', tone: 'violet' },
];

function makeId(prefix = 'party') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generatePartyRoomCode(length = 6) {
  return Array.from({ length }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
}

export function getPartyPresetById(presetId) {
  return PARTY_PRESETS.find((preset) => preset.id === presetId) || PARTY_PRESETS[0];
}

export function normalizePartyText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'"]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildUniquePartyAliases(values = []) {
  const seen = new Set();
  const aliases = [];

  values.forEach((value) => {
    const raw = String(value || '').trim();
    const normalized = normalizePartyText(raw);
    if (!raw || !normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    aliases.push(raw);
  });

  return aliases;
}

export function isDirectPartyMediaUrl(url) {
  const value = String(url || '').trim().toLowerCase();
  return (
    value.endsWith('.mp4')
    || value.endsWith('.webm')
    || value.endsWith('.ogg')
    || value.includes('.mp4?')
    || value.includes('.webm?')
    || value.includes('.ogg?')
  );
}

export function shufflePartyItems(items = []) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getNormalizedAliasSet(values = []) {
  return new Set(
    buildUniquePartyAliases(values)
      .map((entry) => normalizePartyText(entry))
      .filter(Boolean)
  );
}

function isAnswerMatch(inputValue, aliases = []) {
  const normalizedInput = normalizePartyText(inputValue);
  if (!normalizedInput) {
    return false;
  }

  return getNormalizedAliasSet(aliases).has(normalizedInput);
}

function computeSpeedBonus(elapsedMs, limitMs, maxBonus) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(limitMs) || limitMs <= 0 || maxBonus <= 0) {
    return 0;
  }

  const ratio = clamp(1 - (elapsedMs / limitMs), 0, 1);
  return Math.round(ratio * maxBonus);
}

export function createPartySettings(input = {}) {
  const preset = getPartyPresetById(input.presetId);
  const roundCount = clamp(Number(input.roundCount || 10), 5, 20);
  const timePerRoundSec = clamp(Number(input.timePerRoundSec || 12), 8, 20);
  const categoryId = PARTY_CATEGORY_OPTIONS.some((item) => item.id === input.categoryId)
    ? input.categoryId
    : 'all';

  return {
    presetId: preset.id,
    roundCount,
    timePerRoundSec,
    categoryId,
    keyword: String(input.keyword || '').trim(),
    showLiveScores: Boolean(input.showLiveScores ?? true),
    randomOrder: Boolean(input.randomOrder ?? true),
  };
}

function buildChoiceOptions(correctSong, titlePool = []) {
  const distractors = shufflePartyItems(
    titlePool.filter((entry) => Number(entry.sourceTitleId) !== Number(correctSong.sourceTitleId))
  ).slice(0, 3);

  if (distractors.length < 3) {
    return null;
  }

  return shufflePartyItems([
    {
      id: makeId('party-option'),
      label: correctSong.sourceTitleName,
      value: correctSong.sourceTitleName,
      sourceTitleId: correctSong.sourceTitleId,
      isCorrect: true,
    },
    ...distractors.map((entry) => ({
      id: makeId('party-option'),
      label: entry.sourceTitleName,
      value: entry.sourceTitleName,
      sourceTitleId: entry.sourceTitleId,
      isCorrect: false,
    })),
  ]);
}

function buildRound(song, settings, titlePool) {
  const preset = getPartyPresetById(settings.presetId);
  const options = preset.answerMode === 'choice'
    ? buildChoiceOptions(song, titlePool)
    : [];

  if (preset.answerMode === 'choice' && !options) {
    return null;
  }

  return {
    id: makeId('party-round'),
    songId: Number(song.id || 0),
    themeType: song.themeType || 'OP',
    artistName: song.artistName || '',
    songTitle: song.songTitle || '',
    songAliases: buildUniquePartyAliases(song.songAliases || [song.songTitle]),
    sourceTitleId: Number(song.sourceTitleId || 0),
    sourceTitleName: song.sourceTitleName || '',
    sourceTitleAliases: buildUniquePartyAliases(song.sourceTitleAliases || [song.sourceTitleName]),
    mediaUrl: song.mediaUrl || '',
    coverUrl: song.coverUrl || '',
    previewStartSec: Number(song.previewStartSec || 0),
    previewDurationSec: clamp(Number(settings.timePerRoundSec || 12), 8, 20),
    options,
  };
}

export function buildPartyMatchSnapshot(songs = [], settings = {}) {
  const normalizedSettings = createPartySettings(settings);
  const preset = getPartyPresetById(normalizedSettings.presetId);
  const titlePool = Array.from(
    new Map(
      songs.map((song) => [
        Number(song.sourceTitleId || 0),
        {
          sourceTitleId: Number(song.sourceTitleId || 0),
          sourceTitleName: song.sourceTitleName || '',
        },
      ])
    ).values()
  ).filter((entry) => entry.sourceTitleId && entry.sourceTitleName);

  const roundLimit = normalizedSettings.roundCount;
  const orderedSongs = normalizedSettings.randomOrder ? shufflePartyItems(songs) : [...songs];
  const rounds = [];

  for (const song of orderedSongs) {
    if (rounds.length >= roundLimit) {
      break;
    }

    const round = buildRound(song, normalizedSettings, titlePool);
    if (round) {
      rounds.push(round);
    }
  }

  if (rounds.length < Math.min(5, roundLimit)) {
    throw new Error('Not enough playable songs to start this room.');
  }

  const now = Date.now();
  const countdownMs = 3000;

  return {
    id: makeId('party-match'),
    presetId: preset.id,
    phase: 'countdown',
    roundIndex: 0,
    totalRounds: rounds.length,
    timePerRoundSec: normalizedSettings.timePerRoundSec,
    answerGraceSec: PARTY_ANSWER_GRACE_SEC,
    countdownSec: 3,
    revealSec: 6,
    phaseStartedAt: new Date(now).toISOString(),
    phaseEndsAt: new Date(now + countdownMs).toISOString(),
    rounds,
  };
}

export function getPartyCurrentRound(match) {
  if (!match || !Array.isArray(match.rounds)) {
    return null;
  }

  return match.rounds[Number(match.roundIndex || 0)] || null;
}

export function advancePartyMatch(match) {
  if (!match) {
    return null;
  }

  const now = Date.now();
  const nextMatch = { ...match };
  const currentRoundIndex = Number(nextMatch.roundIndex || 0);

  if (nextMatch.phase === 'countdown') {
    nextMatch.phase = 'question';
    nextMatch.phaseStartedAt = new Date(now).toISOString();
    nextMatch.phaseEndsAt = new Date(
      now + ((Number(nextMatch.timePerRoundSec || 12) + Number(nextMatch.answerGraceSec || PARTY_ANSWER_GRACE_SEC)) * 1000)
    ).toISOString();
    return nextMatch;
  }

  if (nextMatch.phase === 'question') {
    nextMatch.phase = 'reveal';
    nextMatch.phaseStartedAt = new Date(now).toISOString();
    nextMatch.phaseEndsAt = new Date(now + (Number(nextMatch.revealSec || 6) * 1000)).toISOString();
    return nextMatch;
  }

  if (nextMatch.phase === 'reveal') {
    const nextRoundIndex = currentRoundIndex + 1;
    if (nextRoundIndex >= Number(nextMatch.totalRounds || 0)) {
      nextMatch.phase = 'final';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = null;
      return nextMatch;
    }

    nextMatch.phase = 'countdown';
    nextMatch.roundIndex = nextRoundIndex;
    nextMatch.phaseStartedAt = new Date(now).toISOString();
    nextMatch.phaseEndsAt = new Date(now + (Number(nextMatch.countdownSec || 3) * 1000)).toISOString();
    return nextMatch;
  }

  return nextMatch;
}

export function scorePartyAnswer({
  presetId,
  round,
  selectedOptionId = '',
  typedTitle = '',
  typedSong = '',
  elapsedMs = 0,
  timeLimitMs = 12000,
} = {}) {
  const preset = getPartyPresetById(presetId);
  const bonus = computeSpeedBonus(elapsedMs, timeLimitMs, preset.speedBonus);

  if (!round) {
    return {
      titleCorrect: false,
      songCorrect: false,
      points: 0,
    };
  }

  if (preset.answerMode === 'choice') {
    const choiceCorrect = (round.options || []).some((option) => option.id === selectedOptionId && option.isCorrect);
    return {
      titleCorrect: choiceCorrect,
      songCorrect: false,
      points: choiceCorrect ? preset.basePoints + bonus : 0,
    };
  }

  if (preset.answerMode === 'typing') {
    const songCorrect = isAnswerMatch(typedSong, round.songAliases);
    return {
      titleCorrect: false,
      songCorrect,
      points: songCorrect ? preset.basePoints + bonus : 0,
    };
  }

  const titleCorrect = isAnswerMatch(typedTitle, round.sourceTitleAliases);
  const songCorrect = isAnswerMatch(typedSong, round.songAliases);
  const basePoints = (titleCorrect ? 100 : 0) + (songCorrect ? 160 : 0);

  return {
    titleCorrect,
    songCorrect,
    points: basePoints > 0 ? basePoints + bonus : 0,
  };
}

export function buildPartyLeaderboard(members = [], answers = []) {
  const board = new Map(
    members.map((member) => [
      String(member.member_token || ''),
      {
        memberToken: String(member.member_token || ''),
        memberName: member.display_name || 'Player',
        avatarKey: member.avatar_key || 'rose',
        avatarUrl: member.avatar_url || '',
        score: 0,
        titleHits: 0,
        songHits: 0,
        answeredRounds: 0,
        fastestMs: null,
      },
    ])
  );

  answers.forEach((answer) => {
    const memberToken = String(answer.member_token || '');
    if (!board.has(memberToken)) {
      board.set(memberToken, {
        memberToken,
        memberName: answer.member_name || 'Player',
        avatarKey: 'rose',
        avatarUrl: '',
        score: 0,
        titleHits: 0,
        songHits: 0,
        answeredRounds: 0,
        fastestMs: null,
      });
    }

    const current = board.get(memberToken);
    current.score += Number(answer.points_awarded || 0);
    current.answeredRounds += 1;
    current.titleHits += answer.title_correct ? 1 : 0;
    current.songHits += answer.song_correct ? 1 : 0;

    const elapsedMs = Number(answer.elapsed_ms || 0);
    if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
      current.fastestMs = current.fastestMs == null ? elapsedMs : Math.min(current.fastestMs, elapsedMs);
    }
  });

  return [...board.values()].sort((left, right) => {
    const scoreDiff = Number(right.score || 0) - Number(left.score || 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const titleDiff = Number(right.titleHits || 0) - Number(left.titleHits || 0);
    if (titleDiff !== 0) {
      return titleDiff;
    }

    const songDiff = Number(right.songHits || 0) - Number(left.songHits || 0);
    if (songDiff !== 0) {
      return songDiff;
    }

    const leftFastest = Number.isFinite(left.fastestMs) ? left.fastestMs : Number.POSITIVE_INFINITY;
    const rightFastest = Number.isFinite(right.fastestMs) ? right.fastestMs : Number.POSITIVE_INFINITY;
    if (leftFastest !== rightFastest) {
      return leftFastest - rightFastest;
    }

    return String(left.memberName || '').localeCompare(String(right.memberName || ''));
  });
}

export function countPartyRoundAnswers(answers = [], roundId = '') {
  return answers.filter((answer) => String(answer.round_id || '') === String(roundId || '')).length;
}
