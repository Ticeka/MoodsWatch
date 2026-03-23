import { describe, expect, it } from 'vitest';
import { normalizeBattleLeaderboardRows } from '../leaderboard.js';

describe('normalizeBattleLeaderboardRows', () => {
  const rows = [
    {
      title_id: 1,
      wins: 12,
      losses: 4,
      total_votes: 16,
      win_rate: 0.75,
      elo_score: 1444.6,
      canonical_titles: {
        id: 1,
        canonical_title: 'Safe Title',
        slug: 'safe-title',
        cover_image: '/safe.jpg',
        type: 'anime',
        is_adult: false,
      },
    },
    {
      title_id: 2,
      wins: 20,
      losses: 2,
      total_votes: 22,
      win_rate: 0.91,
      elo_score: 1679.2,
      canonical_titles: {
        id: 2,
        canonical_title: 'Adult Title',
        slug: 'adult-title',
        cover_image: '/adult.jpg',
        type: 'manhwa',
        is_adult: true,
      },
    },
    {
      title_id: 3,
      wins: 8,
      losses: 8,
      total_votes: 16,
      win_rate: 0.5,
      elo_score: 1200,
      canonical_titles: null,
    },
  ];

  it('keeps only non-adult titles when 18+ mode is off', () => {
    expect(normalizeBattleLeaderboardRows(rows, false)).toEqual([
      expect.objectContaining({
        titleId: 1,
        elo: 1445,
        title: expect.objectContaining({ id: 1, is_adult: false }),
      }),
    ]);
  });

  it('keeps only adult titles when 18+ mode is on', () => {
    expect(normalizeBattleLeaderboardRows(rows, true)).toEqual([
      expect.objectContaining({
        titleId: 2,
        elo: 1679,
        title: expect.objectContaining({ id: 2, is_adult: true }),
      }),
    ]);
  });
});
