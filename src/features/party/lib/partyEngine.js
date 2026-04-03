const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PARTY_ANSWER_GRACE_SEC = 3;
const PARTY_TITLE_GUESS_MAX_CLUES = 4;
const PARTY_TITLE_GUESS_BASE_POINTS = [400, 300, 200, 100];
const PARTY_TITLE_GUESS_DEFAULT_CLUE_SEC = 7;

const PARTY_VIRTUAL_PRESETS = [
  {
    id: 'title-guess',
    label: 'Guess the Title',
    labelTh: 'ทายชื่อเรื่อง',
    description: 'Guess the title from character clue cards before the reveal ends.',
    descriptionTh: 'ทายชื่อเรื่องจากการ์ดตัวละครที่ค่อยๆ เปิดทีละใบ',
    answerMode: 'typing',
    target: 'title',
    basePoints: PARTY_TITLE_GUESS_BASE_POINTS[0],
    speedBonus: 40,
  },
  {
    id: 'title-guess-choice',
    label: 'Guess the Title Choice',
    labelTh: 'ทายชื่อเรื่อง 4 ตัวเลือก',
    description: 'Guess the title from 4 choices while character clues are revealed.',
    descriptionTh: 'ทายชื่อเรื่องจาก 4 ตัวเลือกขณะการ์ดตัวละครค่อย ๆ เปิดทีละใบ',
    answerMode: 'choice',
    target: 'title',
    basePoints: PARTY_TITLE_GUESS_BASE_POINTS[0],
    speedBonus: 40,
  },
];

export const PARTY_TITLE_GUESS_PRESETS = PARTY_VIRTUAL_PRESETS.filter((preset) => preset.target === 'title');

function resolvePartyTemplateSourceIdentity(song = {}) {
  const provider = String(song?.provider || '').trim().toLowerCase();
  const sourceTitleId = Number(song?.sourceTitleId ?? song?.source_title_id ?? 0);
  const sourceTitleName = String(song?.sourceTitleName ?? song?.source_title_name ?? '').trim();
  const resolutionStatus = String(song?.sourceResolutionStatus ?? song?.source_resolution_status ?? '').trim().toLowerCase();
  const resolvedSourceTitleId = Number(song?.resolvedSourceTitleId ?? song?.resolved_source_title_id ?? 0);
  const resolvedSourceTitleName = String(song?.resolvedSourceTitleName ?? song?.resolved_source_title_name ?? '').trim();

  if (provider !== 'youtube' && sourceTitleId > 0 && sourceTitleName) {
    return {
      answerableSourceTitleName: sourceTitleName,
      classicSourceTitleId: sourceTitleId,
      classicSourceTitleName: sourceTitleName,
      classicSourceKey: `id:${sourceTitleId}`,
      isClassicResolved: true,
    };
  }

  const linkedResolvedId = resolvedSourceTitleId || (resolutionStatus === 'linked' ? sourceTitleId : 0);
  const linkedResolvedName = resolvedSourceTitleName || (resolutionStatus === 'linked' ? sourceTitleName : '');
  const isClassicResolved = resolutionStatus === 'linked'
    && linkedResolvedId > 0
    && Boolean(normalizePartyText(linkedResolvedName));

  return {
    answerableSourceTitleName: linkedResolvedName || resolvePartySourceTitleName(song),
    classicSourceTitleId: isClassicResolved ? linkedResolvedId : 0,
    classicSourceTitleName: isClassicResolved ? linkedResolvedName : '',
    classicSourceKey: isClassicResolved ? `id:${linkedResolvedId}` : '',
    isClassicResolved,
  };
}

export const PARTY_PRESETS = [
  {
    id: 'party-classic',
    label: 'Party Classic',
    labelTh: 'Party Classic',
    description: 'Listen to a clip and pick the correct answer from 4 choices.',
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
];

export const PARTY_CATEGORY_OPTIONS = [
  { id: 'all', label: 'All Songs', labelTh: 'รวมทุกเพลง' },
  { id: 'op', label: 'Openings Only', labelTh: 'เฉพาะเพลงเปิด' },
  { id: 'ed', label: 'Endings Only', labelTh: 'เฉพาะเพลงปิด' },
  { id: 'creditless', label: 'Creditless Picks', labelTh: 'เน้นเวอร์ชัน creditless' },
];

export const PARTY_VOTE_PLAYBACK_MODES = [
  { id: 'preview', label: 'Preview clip', labelTh: 'เล่นตามเวลาที่ตั้ง' },
  { id: 'full', label: 'Full clip', labelTh: 'เล่นจนจบคลิป' },
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
  return PARTY_PRESETS.find((preset) => preset.id === presetId)
    || PARTY_VIRTUAL_PRESETS.find((preset) => preset.id === presetId)
    || PARTY_PRESETS[0];
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

export function resolvePartySourceTitleName(song) {
  const rawValue = String(song?.sourceTitleName ?? song?.source_title_name ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const sourceTitleId = Number(song?.sourceTitleId ?? song?.source_title_id ?? 0);
  if (sourceTitleId > 0) {
    return rawValue;
  }

  const provider = String(song?.provider || '').trim().toLowerCase();
  const sourceKind = String(song?.sourceKind ?? song?.source_kind ?? '').trim().toLowerCase();
  if (provider === 'youtube' || sourceKind.startsWith('youtube_')) {
    const artistName = String(song?.artistName ?? song?.artist_name ?? '').trim();
    const metadataChannelTitle = String(song?.metadataJson?.channelTitle ?? song?.metadata_json?.channelTitle ?? '').trim();
    const normalizedRawValue = normalizePartyText(rawValue);
    const matchesArtist = artistName && normalizedRawValue === normalizePartyText(artistName);
    const matchesChannel = metadataChannelTitle && normalizedRawValue === normalizePartyText(metadataChannelTitle);
    if (matchesArtist || matchesChannel) {
      return '';
    }
  }

  return rawValue;
}

export function resolvePartyChoiceIdentity(song = {}) {
  const resolvedSource = resolvePartyTemplateSourceIdentity(song);
  const songTitle = String(song?.songTitle ?? song?.song_title ?? '').trim();
  const normalizedSongTitle = normalizePartyText(songTitle);

  if (resolvedSource.isClassicResolved && resolvedSource.classicSourceKey && resolvedSource.classicSourceTitleName) {
    return {
      answerKey: resolvedSource.classicSourceKey,
      answerLabel: resolvedSource.classicSourceTitleName,
      answerTarget: 'source',
      answerTargetLabel: 'Source title',
      answerTargetLabelTh: 'ชื่อเรื่อง',
      sourceTitleId: resolvedSource.classicSourceTitleId,
    };
  }

  if (normalizedSongTitle) {
    return {
      answerKey: `song:${normalizedSongTitle}`,
      answerLabel: songTitle,
      answerTarget: 'song',
      answerTargetLabel: 'Song title',
      answerTargetLabelTh: 'ชื่อเพลง',
      sourceTitleId: 0,
    };
  }

  return {
    answerKey: '',
    answerLabel: '',
    answerTarget: 'song',
    answerTargetLabel: 'Song title',
    answerTargetLabelTh: 'ชื่อเพลง',
    sourceTitleId: 0,
  };
}

export function getPartySourceKey(song) {
  const sourceTitleId = Number(song?.sourceTitleId ?? song?.source_title_id ?? 0);
  if (sourceTitleId > 0) {
    return `id:${sourceTitleId}`;
  }

  const normalizedSourceTitle = normalizePartyText(resolvePartySourceTitleName(song));
  return normalizedSourceTitle ? `name:${normalizedSourceTitle}` : '';
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

export function getPartyRuntimeSongKey(song) {
  if (!song) {
    return '';
  }

  const provider = String(song.provider || '').trim().toLowerCase();
  if (provider === 'youtube') {
    const mediaId = String(song.providerMediaId || '').trim();
    if (mediaId) {
      return `yt:${mediaId}`;
    }
  }

  const fallbackId = song.id ?? song.songId ?? song.song_id ?? '';
  return String(fallbackId || '').trim();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVoteEntrantCount(value) {
  const requested = Number(value || 8);
  const allowed = [2, 4, 8, 16];
  if (allowed.includes(requested)) {
    return requested;
  }

  return allowed.reduce((closest, current) => (
    Math.abs(current - requested) < Math.abs(closest - requested) ? current : closest
  ), allowed[0]);
}

export function normalizePartyVotePlaybackMode(value) {
  return String(value || '').trim().toLowerCase() === 'full' ? 'full' : 'preview';
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
  const modeType = input.modeType === 'vote'
    ? 'vote'
    : (input.modeType === 'title-guess' ? 'title-guess' : 'quiz');
  const requestedTitleGuessPresetId = String(input.presetId || '').trim();
  const preset = modeType === 'title-guess'
    ? getPartyPresetById(requestedTitleGuessPresetId === 'title-guess-choice' ? 'title-guess-choice' : 'title-guess')
    : getPartyPresetById(input.presetId);
  const roundCount = clamp(Number(input.roundCount || 10), 2, 20);
  const entrantCount = normalizeVoteEntrantCount(input.entrantCount || input.roundCount || 8);
  const isLongPlaybackMode = modeType === 'vote';
  const clipPlaybackMode = modeType === 'vote'
    ? normalizePartyVotePlaybackMode(input.clipPlaybackMode)
    : 'preview';
  const defaultTimePerRoundSec = Number(
    input.timePerRoundSec || (modeType === 'title-guess' ? PARTY_TITLE_GUESS_DEFAULT_CLUE_SEC : 12)
  );
  const timePerRoundSec = clamp(
    defaultTimePerRoundSec,
    modeType === 'title-guess' ? 4 : 8,
    modeType === 'title-guess' ? 15 : (isLongPlaybackMode ? 180 : 20)
  );
  const voteSec = clamp(Number(input.voteSec || 10), 5, 20);
  const revealSec = clamp(Number(input.revealSec || 12), 6, 20);
  const categoryId = PARTY_CATEGORY_OPTIONS.some((item) => item.id === input.categoryId)
    ? input.categoryId
    : 'all';
  const songPresetId = String(input.songPresetId || '').trim();
  const songPresetName = String(input.songPresetName || '').trim();

  return {
    modeType,
    presetId: preset.id,
    roundCount,
    entrantCount,
    clipPlaybackMode,
    timePerRoundSec,
    voteSec,
    revealSec,
    categoryId,
    songPresetId: modeType === 'title-guess' ? '' : songPresetId,
    songPresetName: modeType === 'title-guess' ? '' : songPresetName,
    keyword: String(input.keyword || '').trim(),
    showLiveScores: Boolean(input.showLiveScores ?? true),
    randomOrder: Boolean(input.randomOrder ?? true),
    templateId: modeType === 'title-guess' ? '' : String(input.templateId || '').trim(),
    templateName: modeType === 'title-guess' ? '' : String(input.templateName || '').trim(),
    templateCoverUrl: modeType === 'title-guess' ? '' : String(input.templateCoverUrl || '').trim(),
    templatePlayableCount: modeType === 'title-guess' ? 0 : Math.max(0, Number(input.templatePlayableCount || 0)),
    modeScope: modeType === 'title-guess' ? 'title-guess' : String(input.modeScope || 'all').trim(),
    titleGuessSetId: modeType === 'title-guess'
      ? String(input.titleGuessSetId ?? input.setId ?? '').trim()
      : '',
    titleGuessSetName: modeType === 'title-guess'
      ? String(input.titleGuessSetName ?? input.setName ?? '').trim()
      : '',
    titleGuessQuestionCount: modeType === 'title-guess'
      ? Math.max(0, Number(input.titleGuessQuestionCount ?? input.setQuestionCount ?? 0))
      : 0,
  };
}

function normalizeTitleGuessClueRoleBucket(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['background', 'supporting', 'main-side', 'wildcard'].includes(normalized)
    ? normalized
    : 'supporting';
}

function normalizeTitleGuessClues(clues = []) {
  const uniqueByOrder = new Map();

  (Array.isArray(clues) ? clues : []).forEach((clue) => {
    const clueOrder = clamp(Number(clue?.clueOrder ?? clue?.clue_order ?? 0), 1, PARTY_TITLE_GUESS_MAX_CLUES);
    if (uniqueByOrder.has(clueOrder)) {
      return;
    }

    const characterName = String(
      clue?.characterName
      ?? clue?.character_name_snapshot
      ?? clue?.character_name
      ?? ''
    ).trim();
    if (!characterName) {
      return;
    }

    uniqueByOrder.set(clueOrder, {
      id: String(clue?.id || `clue-${clueOrder}`).trim() || `clue-${clueOrder}`,
      clueOrder,
      clueRoleBucket: normalizeTitleGuessClueRoleBucket(clue?.clueRoleBucket ?? clue?.clue_role_bucket),
      characterId: Number(clue?.characterId ?? clue?.character_id ?? 0) || null,
      characterName,
      characterNameNative: String(
        clue?.characterNameNative
        ?? clue?.character_name_native_snapshot
        ?? ''
      ).trim(),
      characterImageUrl: String(
        clue?.characterImageUrl
        ?? clue?.character_image_url_snapshot
        ?? clue?.image_url
        ?? ''
      ).trim(),
      isManualOverride: Boolean(clue?.isManualOverride ?? clue?.is_manual_override),
    });
  });

  return [...uniqueByOrder.values()]
    .sort((left, right) => left.clueOrder - right.clueOrder)
    .slice(0, PARTY_TITLE_GUESS_MAX_CLUES);
}

function buildTitleGuessRound(question = {}) {
  const clues = normalizeTitleGuessClues(question?.clues ?? question?.party_title_guess_clues);
  if (clues.length < PARTY_TITLE_GUESS_MAX_CLUES) {
    return null;
  }

  const answerTitle = String(question?.answerTitle || question?.answer_title || '').trim();
  const answerTitleAliases = buildUniquePartyAliases(
    question?.answerTitleAliases
    ?? question?.answer_aliases
    ?? (answerTitle ? [answerTitle] : [])
  );
  if (!answerTitleAliases.length) {
    return null;
  }

  return {
    id: String(question?.id || makeId('party-round')).trim(),
    kind: 'title-guess',
    answerTitleId: Number(question?.answerTitleId ?? question?.answer_title_id ?? 0) || null,
    sourceTitleName: answerTitle || answerTitleAliases[0],
    sourceTitleAliases: answerTitleAliases,
    choiceAnswerKey: `title:${normalizePartyText(answerTitleAliases[0])}`,
    choiceAnswerLabel: answerTitle || answerTitleAliases[0],
    choiceTarget: 'source',
    choiceTargetLabel: 'Title',
    choiceTargetLabelTh: 'ชื่อเรื่อง',
    clues,
    totalClues: clues.length,
    difficultyTier: clamp(Number(question?.difficultyTier ?? question?.difficulty_tier ?? 2), 1, 5),
  };
}

function buildTitleGuessChoiceOptions(correctRound, titlePool = []) {
  const correctAnswerKey = String(correctRound?.choiceAnswerKey || '').trim();
  const correctAnswerLabel = String(correctRound?.choiceAnswerLabel || '').trim();
  if (!correctAnswerKey || !correctAnswerLabel) {
    return [];
  }

  const distractors = shufflePartyItems(
    titlePool.filter((entry) => entry.answerKey !== correctAnswerKey)
  ).slice(0, 3);

  if (distractors.length < 3) {
    return [];
  }

  return shufflePartyItems([
    {
      id: makeId('party-option'),
      label: correctAnswerLabel,
      value: correctAnswerLabel,
      answerKey: correctAnswerKey,
      sourceKey: correctAnswerKey,
      sourceTitleId: Number(correctRound?.answerTitleId || 0) || null,
      isCorrect: true,
    },
    ...distractors.map((entry) => ({
      id: makeId('party-option'),
      label: entry.answerLabel,
      value: entry.answerLabel,
      answerKey: entry.answerKey,
      sourceKey: entry.answerKey,
      sourceTitleId: Number(entry.sourceTitleId || 0) || null,
      isCorrect: false,
    })),
  ]);
}

export function buildPartyTitleGuessSnapshot(questions = [], settings = {}) {
  const normalizedSettings = createPartySettings({ ...settings, modeType: 'title-guess' });
  const roundLimit = normalizedSettings.roundCount;
  const preset = getPartyPresetById(normalizedSettings.presetId);
  const eligibleQuestions = (Array.isArray(questions) ? questions : [])
    .map(buildTitleGuessRound)
    .filter(Boolean);

  if (eligibleQuestions.length < roundLimit) {
    throw new Error('Not enough ready Guess the Title questions to start this room.');
  }

  const orderedQuestions = normalizedSettings.randomOrder
    ? shufflePartyItems(eligibleQuestions)
    : [...eligibleQuestions];
  const titlePool = eligibleQuestions.map((entry) => ({
    answerKey: entry.choiceAnswerKey,
    answerLabel: entry.choiceAnswerLabel,
    sourceTitleId: entry.answerTitleId,
  }));
  const rounds = orderedQuestions
    .slice(0, roundLimit)
    .map((entry) => ({
      ...entry,
      options: preset.answerMode === 'choice'
        ? buildTitleGuessChoiceOptions(entry, titlePool)
        : [],
    }));

  if (rounds.length < roundLimit) {
    throw new Error('Not enough ready Guess the Title questions to start this room.');
  }

  if (preset.answerMode === 'choice' && rounds.some((entry) => entry.options.length < 4)) {
    throw new Error('Not enough distinct title choices to start this room.');
  }

  const now = Date.now();
  const countdownMs = 3000;

  return {
    id: makeId('title-guess-match'),
    modeType: 'title-guess',
    presetId: preset.id,
    phase: 'countdown',
    roundIndex: 0,
    totalRounds: rounds.length,
    timePerRoundSec: normalizedSettings.timePerRoundSec,
    answerGraceSec: PARTY_ANSWER_GRACE_SEC,
    countdownSec: 3,
    revealSec: normalizedSettings.revealSec,
    titleGuessSetId: normalizedSettings.titleGuessSetId || '',
    titleGuessSetName: normalizedSettings.titleGuessSetName || '',
    titleGuessQuestionCount: normalizedSettings.titleGuessQuestionCount || rounds.length,
    revealedClueCount: 0,
    rounds,
    phaseStartedAt: new Date(now).toISOString(),
    phaseEndsAt: new Date(now + countdownMs).toISOString(),
  };
}

function buildChoiceOptions(correctSong, titlePool = []) {
  const correctAnswerKey = correctSong.choiceAnswerKey || '';
  const correctAnswerLabel = correctSong.choiceAnswerLabel || '';
  if (!correctAnswerKey || !correctAnswerLabel) {
    return null;
  }

  const distractors = shufflePartyItems(
    titlePool.filter((entry) => entry.answerKey !== correctAnswerKey)
  ).slice(0, 3);

  if (distractors.length < 3) {
    return null;
  }

  return shufflePartyItems([
    {
      id: makeId('party-option'),
      label: correctAnswerLabel,
      value: correctAnswerLabel,
      answerKey: correctAnswerKey,
      sourceKey: correctAnswerKey,
      sourceTitleId: correctSong.choiceAnswerSourceTitleId || correctSong.classicSourceTitleId,
      isCorrect: true,
    },
    ...distractors.map((entry) => ({
      id: makeId('party-option'),
      label: entry.answerLabel,
      value: entry.answerLabel,
      answerKey: entry.answerKey,
      sourceKey: entry.answerKey,
      sourceTitleId: entry.sourceTitleId,
      isCorrect: false,
    })),
  ]);
}

function buildRound(song, settings, titlePool) {
  const preset = getPartyPresetById(settings.presetId);
  const resolvedSource = resolvePartyTemplateSourceIdentity(song);
  const choiceIdentity = resolvePartyChoiceIdentity({ ...song, ...resolvedSource });
  const sourceTitleName = resolvedSource.answerableSourceTitleName;
  const sourceKey = resolvedSource.isClassicResolved ? resolvedSource.classicSourceKey : getPartySourceKey(song);
  const options = preset.answerMode === 'choice'
    ? buildChoiceOptions({
      ...song,
      ...resolvedSource,
      sourceKey,
      sourceTitleName,
      choiceAnswerKey: choiceIdentity.answerKey,
      choiceAnswerLabel: choiceIdentity.answerLabel,
      choiceAnswerSourceTitleId: choiceIdentity.sourceTitleId,
    }, titlePool)
    : [];

  if (preset.answerMode === 'choice' && (!choiceIdentity.answerKey || !options)) {
    return null;
  }

  if (preset.answerMode === 'dual' && !sourceTitleName) {
    return null;
  }

  return {
    id: makeId('party-round'),
    songId: getPartyRuntimeSongKey(song),
    themeType: song.themeType || 'OP',
    artistName: song.artistName || '',
    songTitle: song.songTitle || '',
    songAliases: buildUniquePartyAliases(song.songAliases || [song.songTitle]),
    sourceKey,
    sourceTitleId: resolvedSource.classicSourceTitleId || Number(song.sourceTitleId || 0),
    sourceTitleName,
    sourceTitleAliases: buildUniquePartyAliases(song.sourceTitleAliases || [sourceTitleName]),
    mediaUrl: song.mediaUrl || '',
    coverUrl: song.coverUrl || '',
    previewStartSec: Number(song.previewStartSec || 0),
    previewDurationSec: Number(settings.timePerRoundSec || 12),
    provider: song.provider || 'catalog',
    providerMediaId: song.providerMediaId || null,
    choiceTarget: choiceIdentity.answerTarget || 'source',
    choiceTargetLabel: choiceIdentity.answerTargetLabel || 'Source title',
    choiceTargetLabelTh: choiceIdentity.answerTargetLabelTh || 'ชื่อเรื่อง',
    options,
  };
}

export function buildPartyMatchSnapshot(songs = [], settings = {}) {
  const normalizedSettings = createPartySettings(settings);
  if (normalizedSettings.modeType === 'title-guess') {
    return buildPartyTitleGuessSnapshot(songs, normalizedSettings);
  }
  const preset = getPartyPresetById(normalizedSettings.presetId);
  const roundLimit = normalizedSettings.roundCount;
  const normalizedSongs = Array.isArray(songs)
    ? songs.map((song) => {
      const resolvedSource = resolvePartyTemplateSourceIdentity(song);
      const choiceIdentity = resolvePartyChoiceIdentity({ ...song, ...resolvedSource });
      return {
        ...song,
        ...resolvedSource,
        ...choiceIdentity,
        sourceKey: getPartySourceKey(song),
        sourceTitleName: resolvedSource.answerableSourceTitleName,
      };
    })
    : [];
  const eligibleSongs = normalizedSongs.filter((song) => {
    const hasSongTitle = Boolean(normalizePartyText(song.songTitle));
    const hasSourceTitle = Boolean(normalizePartyText(song.sourceTitleName));
    if (preset.answerMode === 'choice') {
      return hasSongTitle && Boolean(song.answerKey) && Boolean(song.answerLabel);
    }
    if (preset.answerMode === 'dual') {
      return hasSongTitle && hasSourceTitle;
    }
    return hasSongTitle;
  });
  const titlePool = Array.from(
    new Map(
      eligibleSongs.map((song) => [
        song.answerKey,
        {
          answerKey: song.answerKey,
          answerLabel: song.answerLabel || '',
          sourceTitleId: Number(song.sourceTitleId || song.classicSourceTitleId || 0),
        },
      ])
    ).values()
  ).filter((entry) => entry.answerKey && entry.answerLabel);

  const requiredPoolSize = preset.answerMode === 'choice'
    ? Math.max(5, roundLimit)
    : roundLimit;

  if (eligibleSongs.length < requiredPoolSize) {
    throw new Error('Not enough playable songs to start this room.');
  }

  if (preset.answerMode === 'choice' && titlePool.length < 4) {
    throw new Error('Not enough distinct answer choices to start this room.');
  }

  const orderedSongs = normalizedSettings.randomOrder ? shufflePartyItems(eligibleSongs) : [...eligibleSongs];
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

  if (rounds.length < roundLimit) {
    throw new Error('Not enough playable songs to start this room.');
  }

  const now = Date.now();
  const countdownMs = 3000;

  return {
    id: makeId('party-match'),
    modeType: 'quiz',
    presetId: preset.id,
    phase: 'countdown',
    roundIndex: 0,
    totalRounds: rounds.length,
    timePerRoundSec: normalizedSettings.timePerRoundSec,
    answerGraceSec: PARTY_ANSWER_GRACE_SEC,
    countdownSec: 3,
    revealSec: normalizedSettings.revealSec,
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

export function getPartyPhaseEndsAtMs(match) {
  const timestamp = new Date(match?.phaseEndsAt || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

export function isPartyPhaseExpired(match, now = Date.now()) {
  const phaseEndsAtMs = getPartyPhaseEndsAtMs(match);
  return Boolean(phaseEndsAtMs) && now >= phaseEndsAtMs;
}

export function isPartyAnswerWindowOpen(match, now = Date.now()) {
  return match?.phase === 'question' && !isPartyPhaseExpired(match, now);
}

export function getPartyRequiredReadyCount(memberCount = 0) {
  const normalizedCount = Math.max(0, Number(memberCount || 0));
  return normalizedCount > 0 ? Math.min(2, normalizedCount) : 0;
}

export function advancePartyMatch(match) {
  if (!match) {
    return null;
  }

  if (match.modeType === 'title-guess') {
    const now = Date.now();
    const nextMatch = { ...match };
    const currentRound = getPartyCurrentRound(nextMatch);
    const totalClues = Math.max(1, Number(currentRound?.totalClues || PARTY_TITLE_GUESS_MAX_CLUES));

    if (nextMatch.phase === 'countdown') {
      nextMatch.phase = 'question';
      nextMatch.revealedClueCount = 1;
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(
        now + ((Number(nextMatch.timePerRoundSec || PARTY_TITLE_GUESS_DEFAULT_CLUE_SEC) + Number(nextMatch.answerGraceSec || PARTY_ANSWER_GRACE_SEC)) * 1000)
      ).toISOString();
      return nextMatch;
    }

    if (nextMatch.phase === 'question') {
      const currentClueCount = clamp(Number(nextMatch.revealedClueCount || 1), 1, totalClues);
      if (currentClueCount < totalClues) {
        nextMatch.revealedClueCount = currentClueCount + 1;
        nextMatch.phaseStartedAt = new Date(now).toISOString();
        nextMatch.phaseEndsAt = new Date(
          now + ((Number(nextMatch.timePerRoundSec || PARTY_TITLE_GUESS_DEFAULT_CLUE_SEC) + Number(nextMatch.answerGraceSec || PARTY_ANSWER_GRACE_SEC)) * 1000)
        ).toISOString();
        return nextMatch;
      }

      nextMatch.phase = 'reveal';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + (Number(nextMatch.revealSec || 6) * 1000)).toISOString();
      return nextMatch;
    }

    if (nextMatch.phase === 'reveal') {
      const nextRoundIndex = Number(nextMatch.roundIndex || 0) + 1;
      if (nextRoundIndex >= Number(nextMatch.totalRounds || 0)) {
        nextMatch.phase = 'final';
        nextMatch.phaseStartedAt = new Date(now).toISOString();
        nextMatch.phaseEndsAt = null;
        return nextMatch;
      }

      nextMatch.phase = 'countdown';
      nextMatch.roundIndex = nextRoundIndex;
      nextMatch.revealedClueCount = 0;
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + (Number(nextMatch.countdownSec || 3) * 1000)).toISOString();
      return nextMatch;
    }

    return nextMatch;
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

  if (preset.id === 'title-guess' || round?.kind === 'title-guess') {
    const titleCorrect = isAnswerMatch(typedTitle, round.sourceTitleAliases);
    const revealedClueCount = clamp(Number(round?.revealedClueCount || 1), 1, PARTY_TITLE_GUESS_MAX_CLUES);
    const basePoints = PARTY_TITLE_GUESS_BASE_POINTS[revealedClueCount - 1]
      || PARTY_TITLE_GUESS_BASE_POINTS[PARTY_TITLE_GUESS_BASE_POINTS.length - 1]
      || 100;
    return {
      titleCorrect,
      songCorrect: false,
      points: titleCorrect ? basePoints + bonus : 0,
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


