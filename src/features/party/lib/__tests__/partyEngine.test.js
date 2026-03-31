import { describe, expect, it } from 'vitest';
import {
  advancePartyMatch,
  buildPartyMatchSnapshot,
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

    const dualScore = scorePartyAnswer({
      presetId: 'full-recall',
      round,
      typedTitle: 'Naruto',
      typedSong: 'Blue Bird',
      elapsedMs: 1200,
      timeLimitMs: 12000,
    });

    expect(typingScore.songCorrect).toBe(true);
    expect(typingScore.points).toBeGreaterThan(180);
    expect(dualScore.titleCorrect).toBe(true);
    expect(dualScore.songCorrect).toBe(true);
    expect(dualScore.points).toBeGreaterThan(260);
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
});
