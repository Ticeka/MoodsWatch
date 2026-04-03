import { describe, expect, it } from 'vitest';
import {
  advancePartyMatch,
  buildPartyMatchSnapshot,
  buildPartyTitleGuessSnapshot,
  buildUniquePartyAliases,
  createPartySettings,
  getPartyRequiredReadyCount,
  isPartyAnswerWindowOpen,
  normalizePartyText,
  scorePartyAnswer,
} from '../partyEngine.js';

const SONGS = [
  {
    id: 1,
    themeType: 'OP',
    songTitle: 'Blue Bird',
    songAliases: ['Blue Bird'],
    artistName: 'Ikimonogakari',
    sourceTitleId: 101,
    sourceTitleName: 'Naruto Shippuden',
    sourceTitleAliases: ['Naruto Shippuden', 'Naruto'],
    mediaUrl: 'https://cdn.example.com/1.mp4',
    coverUrl: 'https://cdn.example.com/1.jpg',
  },
  {
    id: 2,
    themeType: 'OP',
    songTitle: 'Again',
    songAliases: ['Again'],
    artistName: 'YUI',
    sourceTitleId: 102,
    sourceTitleName: 'Fullmetal Alchemist: Brotherhood',
    sourceTitleAliases: ['Fullmetal Alchemist Brotherhood', 'FMAB'],
    mediaUrl: 'https://cdn.example.com/2.mp4',
    coverUrl: 'https://cdn.example.com/2.jpg',
  },
  {
    id: 3,
    themeType: 'ED',
    songTitle: 'Fly Me to the Moon',
    songAliases: ['Fly Me to the Moon'],
    artistName: 'Claire',
    sourceTitleId: 103,
    sourceTitleName: 'Neon Genesis Evangelion',
    sourceTitleAliases: ['Neon Genesis Evangelion', 'Evangelion'],
    mediaUrl: 'https://cdn.example.com/3.mp4',
    coverUrl: 'https://cdn.example.com/3.jpg',
  },
  {
    id: 4,
    themeType: 'OP',
    songTitle: 'Kaikai Kitan',
    songAliases: ['Kaikai Kitan'],
    artistName: 'Eve',
    sourceTitleId: 104,
    sourceTitleName: 'Jujutsu Kaisen',
    sourceTitleAliases: ['Jujutsu Kaisen'],
    mediaUrl: 'https://cdn.example.com/4.mp4',
    coverUrl: 'https://cdn.example.com/4.jpg',
  },
  {
    id: 5,
    themeType: 'OP',
    songTitle: 'Gurenge',
    songAliases: ['Gurenge'],
    artistName: 'LiSA',
    sourceTitleId: 105,
    sourceTitleName: 'Demon Slayer',
    sourceTitleAliases: ['Demon Slayer', 'Kimetsu no Yaiba'],
    mediaUrl: 'https://cdn.example.com/5.mp4',
    coverUrl: 'https://cdn.example.com/5.jpg',
  },
];

const TITLE_GUESS_QUESTIONS = [
  {
    id: 'tg-1',
    answerTitleId: 201,
    answerTitle: 'Haikyuu!!',
    answerTitleAliases: ['Haikyuu!!', 'Haikyu'],
    franchiseId: 9001,
    franchiseName: 'Haikyuu!',
    franchiseAliases: ['Haikyuu!', 'Haikyuu Season Series'],
    clues: [
      { id: 'tg-1-c1', clueOrder: 1, clueRoleBucket: 'supporting', characterName: 'Yamaguchi Tadashi', characterImageUrl: 'https://cdn.example.com/tg1-1.jpg' },
      { id: 'tg-1-c2', clueOrder: 2, clueRoleBucket: 'supporting', characterName: 'Tsukishima Kei', characterImageUrl: 'https://cdn.example.com/tg1-2.jpg' },
      { id: 'tg-1-c3', clueOrder: 3, clueRoleBucket: 'main-side', characterName: 'Kageyama Tobio', characterImageUrl: 'https://cdn.example.com/tg1-3.jpg' },
      { id: 'tg-1-c4', clueOrder: 4, clueRoleBucket: 'wildcard', characterName: 'Nishinoya Yuu', characterImageUrl: 'https://cdn.example.com/tg1-4.jpg' },
    ],
  },
  {
    id: 'tg-2',
    answerTitleId: 202,
    answerTitle: 'Gintama',
    answerTitleAliases: ['Gintama'],
    franchiseId: 9002,
    franchiseName: 'Gintama',
    franchiseAliases: ['Gintama'],
    clues: [
      { id: 'tg-2-c1', clueOrder: 1, clueRoleBucket: 'supporting', characterName: 'Sarutobi Ayame', characterImageUrl: 'https://cdn.example.com/tg2-1.jpg' },
      { id: 'tg-2-c2', clueOrder: 2, clueRoleBucket: 'supporting', characterName: 'Katsura Kotaro', characterImageUrl: 'https://cdn.example.com/tg2-2.jpg' },
      { id: 'tg-2-c3', clueOrder: 3, clueRoleBucket: 'main-side', characterName: 'Kagura', characterImageUrl: 'https://cdn.example.com/tg2-3.jpg' },
      { id: 'tg-2-c4', clueOrder: 4, clueRoleBucket: 'wildcard', characterName: 'Hijikata Toshiro', characterImageUrl: 'https://cdn.example.com/tg2-4.jpg' },
    ],
  },
];

const TITLE_GUESS_CHOICE_QUESTIONS = [
  ...TITLE_GUESS_QUESTIONS,
  {
    id: 'tg-3',
    answerTitleId: 203,
    answerTitle: 'Kuroko no Basket',
    answerTitleAliases: ['Kuroko no Basket', 'Kuroko Basketball'],
    franchiseId: 9003,
    franchiseName: 'Kuroko no Basket',
    franchiseAliases: ['Kuroko no Basket'],
    clues: [
      { id: 'tg-3-c1', clueOrder: 1, clueRoleBucket: 'supporting', characterName: 'Hyuga Junpei', characterImageUrl: 'https://cdn.example.com/tg3-1.jpg' },
      { id: 'tg-3-c2', clueOrder: 2, clueRoleBucket: 'supporting', characterName: 'Izuki Shun', characterImageUrl: 'https://cdn.example.com/tg3-2.jpg' },
      { id: 'tg-3-c3', clueOrder: 3, clueRoleBucket: 'main-side', characterName: 'Kagami Taiga', characterImageUrl: 'https://cdn.example.com/tg3-3.jpg' },
      { id: 'tg-3-c4', clueOrder: 4, clueRoleBucket: 'wildcard', characterName: 'Kuroko Tetsuya', characterImageUrl: 'https://cdn.example.com/tg3-4.jpg' },
    ],
  },
  {
    id: 'tg-4',
    answerTitleId: 204,
    answerTitle: 'Free!',
    answerTitleAliases: ['Free!', 'Free Iwatobi Swim Club'],
    franchiseId: 9004,
    franchiseName: 'Free!',
    franchiseAliases: ['Free!', 'Free Series'],
    clues: [
      { id: 'tg-4-c1', clueOrder: 1, clueRoleBucket: 'supporting', characterName: 'Ryuugazaki Rei', characterImageUrl: 'https://cdn.example.com/tg4-1.jpg' },
      { id: 'tg-4-c2', clueOrder: 2, clueRoleBucket: 'supporting', characterName: 'Nagisa Hazuki', characterImageUrl: 'https://cdn.example.com/tg4-2.jpg' },
      { id: 'tg-4-c3', clueOrder: 3, clueRoleBucket: 'main-side', characterName: 'Tachibana Makoto', characterImageUrl: 'https://cdn.example.com/tg4-3.jpg' },
      { id: 'tg-4-c4', clueOrder: 4, clueRoleBucket: 'wildcard', characterName: 'Nanase Haruka', characterImageUrl: 'https://cdn.example.com/tg4-4.jpg' },
    ],
  },
];

describe('partyEngine', () => {
  it('normalizes free-text answers consistently', () => {
    expect(normalizePartyText('  Fullmetal Alchemist: Brotherhood!! ')).toBe('fullmetal alchemist brotherhood');
  });

  it('dedupes aliases by normalized value', () => {
    expect(buildUniquePartyAliases(['Naruto', ' naruto ', 'NARUTO', 'Naruto Shippuden'])).toEqual(['Naruto', 'Naruto Shippuden']);
  });

  it('builds a playable classic match with choice options', () => {
    const match = buildPartyMatchSnapshot(SONGS, {
      presetId: 'party-classic',
      roundCount: 5,
      timePerRoundSec: 12,
      categoryId: 'all',
      randomOrder: false,
    });

    expect(match.rounds).toHaveLength(5);
    expect(match.rounds[0].options).toHaveLength(4);
    expect(match.phase).toBe('countdown');
  });

  it('scores typing answers using alias matching', () => {
    const round = {
      songAliases: ['Blue Bird'],
      sourceTitleAliases: ['Naruto Shippuden', 'Naruto'],
      options: [],
    };

    const typingScore = scorePartyAnswer({
      presetId: 'song-typing',
      round,
      typedSong: 'blue bird',
      elapsedMs: 1500,
      timeLimitMs: 12000,
    });

    const fasterTypingScore = scorePartyAnswer({
      presetId: 'song-typing',
      round,
      typedTitle: 'Naruto',
      typedSong: 'Blue Bird',
      elapsedMs: 1200,
      timeLimitMs: 12000,
    });

    expect(typingScore.songCorrect).toBe(true);
    expect(typingScore.points).toBeGreaterThan(180);
    expect(fasterTypingScore.songCorrect).toBe(true);
    expect(fasterTypingScore.points).toBeGreaterThan(typingScore.points);
  });

  it('advances match phases in order until final', () => {
    const initial = buildPartyMatchSnapshot(SONGS, {
      presetId: 'party-classic',
      roundCount: 5,
      timePerRoundSec: 12,
      categoryId: 'all',
      randomOrder: false,
    });

    const question = advancePartyMatch(initial);
    const reveal = advancePartyMatch(question);

    expect(question.phase).toBe('question');
    expect(reveal.phase).toBe('reveal');
  });

  it('closes the answer window once the question phase end passes', () => {
    const questionMatch = {
      phase: 'question',
      phaseEndsAt: '2026-03-29T10:00:12.000Z',
    };

    expect(isPartyAnswerWindowOpen(questionMatch, new Date('2026-03-29T10:00:11.999Z').getTime())).toBe(true);
    expect(isPartyAnswerWindowOpen(questionMatch, new Date('2026-03-29T10:00:12.000Z').getTime())).toBe(false);
  });

  it('uses a consistent ready threshold for lobby start checks', () => {
    expect(getPartyRequiredReadyCount(0)).toBe(0);
    expect(getPartyRequiredReadyCount(1)).toBe(1);
    expect(getPartyRequiredReadyCount(2)).toBe(2);
    expect(getPartyRequiredReadyCount(6)).toBe(2);
  });

  it('allows 2 rounds minimum and preserves vote-specific settings', () => {
    const settings = createPartySettings({
      modeType: 'vote',
      roundCount: 2,
      entrantCount: 4,
      voteSec: 15,
      timePerRoundSec: 20,
      revealSec: 8,
    });

    expect(settings.modeType).toBe('vote');
    expect(settings.roundCount).toBe(2);
    expect(settings.entrantCount).toBe(4);
    expect(settings.voteSec).toBe(15);
    expect(settings.timePerRoundSec).toBe(20);
    expect(settings.revealSec).toBe(8);
  });

  it('allows longer clip windows for vote battle playback', () => {
    const settings = createPartySettings({
      modeType: 'vote',
      timePerRoundSec: 90,
    });

    expect(settings.timePerRoundSec).toBe(90);
  });

  it('defaults vote playback mode to preview and accepts full clip mode', () => {
    const defaultVoteSettings = createPartySettings({
      modeType: 'vote',
    });
    const fullClipSettings = createPartySettings({
      modeType: 'vote',
      clipPlaybackMode: 'full',
    });

    expect(defaultVoteSettings.clipPlaybackMode).toBe('preview');
    expect(fullClipSettings.clipPlaybackMode).toBe('full');
  });

  it('preserves template metadata used by the room hub and lobby summary', () => {
    const settings = createPartySettings({
      templateId: '42',
      templateName: 'Anime Classics',
      templateCoverUrl: 'https://cdn.example.com/template.jpg',
      templatePlayableCount: 6,
    });

    expect(settings.templateId).toBe('42');
    expect(settings.templateName).toBe('Anime Classics');
    expect(settings.templateCoverUrl).toBe('https://cdn.example.com/template.jpg');
    expect(settings.templatePlayableCount).toBe(6);
  });

  it('normalizes title-guess settings without carrying song-specific fields', () => {
    const settings = createPartySettings({
      modeType: 'title-guess',
      presetId: 'title-guess-choice',
      titleGuessSetId: '55',
      titleGuessSetName: 'Side Cast Legends',
      titleGuessQuestionCount: 48,
      templateId: 'old-song-template',
      songPresetId: 'legacy-preset',
      timePerRoundSec: 6,
    });

    expect(settings.modeType).toBe('title-guess');
    expect(settings.presetId).toBe('title-guess-choice');
    expect(settings.titleGuessSetId).toBe('55');
    expect(settings.titleGuessSetName).toBe('Side Cast Legends');
    expect(settings.titleGuessQuestionCount).toBe(48);
    expect(settings.templateId).toBe('');
    expect(settings.songPresetId).toBe('');
    expect(settings.timePerRoundSec).toBe(6);
  });

  it('builds a title-guess match with 4 ordered clues per round', () => {
    const match = buildPartyTitleGuessSnapshot(TITLE_GUESS_QUESTIONS, {
      modeType: 'title-guess',
      roundCount: 2,
      randomOrder: false,
      titleGuessSetId: 'set-1',
      titleGuessSetName: 'Anime Side Cast',
    });

    expect(match.modeType).toBe('title-guess');
    expect(match.rounds).toHaveLength(2);
    expect(match.rounds[0].clues).toHaveLength(4);
    expect(match.revealedClueCount).toBe(0);
    expect(match.rounds[0].sourceTitleAliases).toContain('Haikyuu!!');
  });

  it('builds a title-guess choice match with 4 answer options per round', () => {
    const match = buildPartyTitleGuessSnapshot(TITLE_GUESS_CHOICE_QUESTIONS, {
      modeType: 'title-guess',
      presetId: 'title-guess-choice',
      roundCount: 2,
      randomOrder: false,
    });

    expect(match.presetId).toBe('title-guess-choice');
    expect(match.rounds[0].options).toHaveLength(4);
    expect(match.rounds[0].options.filter((option) => option.isCorrect)).toHaveLength(1);
  });

  it('advances title-guess rounds by revealing one clue at a time before reveal', () => {
    const initial = buildPartyTitleGuessSnapshot(TITLE_GUESS_QUESTIONS, {
      modeType: 'title-guess',
      roundCount: 2,
      randomOrder: false,
    });

    const clue1 = advancePartyMatch(initial);
    const clue2 = advancePartyMatch(clue1);
    const clue3 = advancePartyMatch(clue2);
    const clue4 = advancePartyMatch(clue3);
    const reveal = advancePartyMatch(clue4);

    expect(clue1.phase).toBe('question');
    expect(clue1.revealedClueCount).toBe(1);
    expect(clue4.phase).toBe('question');
    expect(clue4.revealedClueCount).toBe(4);
    expect(reveal.phase).toBe('reveal');
  });

  it('scores title-guess answers with higher points for earlier clues', () => {
    const round = {
      kind: 'title-guess',
      sourceTitleAliases: ['Haikyuu!!', 'Haikyu'],
      revealedClueCount: 1,
    };

    const earlyScore = scorePartyAnswer({
      presetId: 'title-guess',
      round,
      typedTitle: 'Haikyu',
      elapsedMs: 800,
      timeLimitMs: 7000,
    });

    const lateScore = scorePartyAnswer({
      presetId: 'title-guess',
      round: { ...round, revealedClueCount: 4 },
      typedTitle: 'Haikyuu!!',
      elapsedMs: 800,
      timeLimitMs: 7000,
    });

    expect(earlyScore.titleCorrect).toBe(true);
    expect(earlyScore.points).toBeGreaterThan(lateScore.points);
    expect(lateScore.titleCorrect).toBe(true);
  });

  it('accepts franchise aliases for title-guess typing answers', () => {
    const round = {
      kind: 'title-guess',
      sourceTitleAliases: ['Attack on Titan Season 2'],
      franchiseAliases: ['Attack on Titan', 'Shingeki no Kyojin'],
      revealedClueCount: 2,
    };

    const score = scorePartyAnswer({
      presetId: 'title-guess',
      round,
      typedTitle: 'Attack on Titan',
      elapsedMs: 900,
      timeLimitMs: 7000,
    });

    expect(score.titleCorrect).toBe(true);
    expect(score.points).toBeGreaterThan(0);
  });

  it('scores title-guess choice answers from selected option ids', () => {
    const match = buildPartyTitleGuessSnapshot(TITLE_GUESS_CHOICE_QUESTIONS, {
      modeType: 'title-guess',
      presetId: 'title-guess-choice',
      roundCount: 1,
      randomOrder: false,
    });
    const round = match.rounds[0];
    const correctOption = round.options.find((option) => option.isCorrect);

    const score = scorePartyAnswer({
      presetId: 'title-guess-choice',
      round,
      selectedOptionId: correctOption?.id,
      elapsedMs: 500,
      timeLimitMs: 7000,
    });

    expect(score.titleCorrect).toBe(true);
    expect(score.songCorrect).toBe(false);
    expect(score.points).toBeGreaterThan(400);
  });

  it('accepts same-franchise options for title-guess choice answers', () => {
    const round = {
      kind: 'title-guess',
      revealedClueCount: 2,
      franchiseAnswerKey: 'franchise:attack on titan',
      options: [
        {
          id: 'opt-correct',
          label: 'Attack on Titan Season 2',
          isCorrect: true,
          franchiseAnswerKey: 'franchise:attack on titan',
        },
        {
          id: 'opt-family',
          label: 'Attack on Titan Final Season',
          isCorrect: false,
          franchiseAnswerKey: 'franchise:attack on titan',
        },
      ],
    };

    const score = scorePartyAnswer({
      presetId: 'title-guess-choice',
      round,
      selectedOptionId: 'opt-family',
      elapsedMs: 500,
      timeLimitMs: 7000,
    });

    expect(score.titleCorrect).toBe(true);
    expect(score.points).toBeGreaterThan(0);
  });

  it('builds distinct runtime song keys for YouTube rounds', () => {
    const youtubeSongs = Array.from({ length: 5 }, (_, index) => ({
      id: 0,
      provider: 'youtube',
      providerMediaId: `yt-video-${index + 1}`,
      themeType: 'OP',
      songTitle: `YouTube Song ${index + 1}`,
      songAliases: [`YouTube Song ${index + 1}`],
      artistName: 'Uploader',
      sourceTitleId: 100 + index,
      sourceTitleName: `YouTube Source ${index + 1}`,
      sourceTitleAliases: [`YouTube Source ${index + 1}`],
      mediaUrl: '',
      coverUrl: `https://img.youtube.com/yt-video-${index + 1}.jpg`,
    }));

    const match = buildPartyMatchSnapshot(youtubeSongs, {
      presetId: 'song-typing',
      roundCount: 5,
      randomOrder: false,
    });

    expect(match.rounds).toHaveLength(5);
    expect(match.rounds[0].songId).toBe('yt:yt-video-1');
    expect(new Set(match.rounds.map((round) => round.songId)).size).toBe(5);
  });

  it('falls back to song-title choices for unresolved YouTube Party Classic rounds', () => {
    const youtubeSongs = Array.from({ length: 5 }, (_, index) => ({
      id: 0,
      provider: 'youtube',
      providerMediaId: `classic-yt-${index + 1}`,
      themeType: 'YT',
      songTitle: `Classic Song ${index + 1}`,
      songAliases: [`Classic Song ${index + 1}`],
      artistName: `Uploader ${index + 1}`,
      sourceTitleId: 0,
      sourceTitleName: `Series ${index + 1}`,
      sourceTitleAliases: [`Series ${index + 1}`],
      mediaUrl: '',
      coverUrl: `https://img.youtube.com/classic-${index + 1}.jpg`,
    }));

    const match = buildPartyMatchSnapshot(youtubeSongs, {
      presetId: 'party-classic',
      roundCount: 5,
      randomOrder: false,
    });

    expect(match.rounds).toHaveLength(5);
    expect(match.rounds[0].choiceTarget).toBe('song');
    expect(match.rounds[0].options).toHaveLength(4);
    expect(match.rounds[0].options.some((option) => option.label === 'Classic Song 1')).toBe(true);
  });

  it('builds Party Classic rounds for YouTube songs once canonical sources are linked', () => {
    const youtubeSongs = Array.from({ length: 5 }, (_, index) => ({
      id: 0,
      provider: 'youtube',
      providerMediaId: `classic-linked-${index + 1}`,
      themeType: 'YT',
      songTitle: `Classic Song ${index + 1}`,
      songAliases: [`Classic Song ${index + 1}`],
      artistName: `Uploader ${index + 1}`,
      sourceTitleId: 800 + index,
      sourceTitleName: `Series ${index + 1}`,
      resolvedSourceTitleId: 800 + index,
      resolvedSourceTitleName: `Series ${index + 1}`,
      sourceResolutionStatus: 'linked',
      sourceTitleAliases: [`Series ${index + 1}`],
      mediaUrl: '',
      coverUrl: `https://img.youtube.com/classic-linked-${index + 1}.jpg`,
    }));

    const match = buildPartyMatchSnapshot(youtubeSongs, {
      presetId: 'party-classic',
      roundCount: 5,
      randomOrder: false,
    });

    expect(match.rounds).toHaveLength(5);
    expect(match.rounds[0].options).toHaveLength(4);
    expect(match.rounds[0].sourceTitleName).toBe('Series 1');
  });

  it('rejects Party Classic when there are not enough distinct choice answers', () => {
    const limitedSongs = Array.from({ length: 5 }, (_, index) => ({
      ...SONGS[index],
      songTitle: index < 3 ? 'Shared Song A' : 'Shared Song B',
      songAliases: [index < 3 ? 'Shared Song A' : 'Shared Song B'],
      sourceTitleId: 0,
      sourceTitleName: '',
      sourceTitleAliases: [],
    }));

    expect(() => buildPartyMatchSnapshot(limitedSongs, {
      presetId: 'party-classic',
      roundCount: 5,
      randomOrder: false,
    })).toThrow('Not enough distinct answer choices');
  });
});


