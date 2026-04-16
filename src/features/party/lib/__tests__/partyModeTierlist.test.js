import { describe, expect, it } from 'vitest';
import { advancePartyTierlistMatch, tallyTierlistVotes } from '../partyModeTierlist';

describe('partyModeTierlist', () => {
  it('calculates ranking score metadata from tierlist votes', () => {
    const rows = [
      { label: 'S', color: '#f66' },
      { label: 'A', color: '#fa6' },
      { label: 'B', color: '#fd6' },
      { label: 'C', color: '#ff6' },
    ];

    const result = tallyTierlistVotes(rows, [
      { selected_option_id: 'A' },
      { selected_option_id: 'A' },
      { selected_option_id: 'S' },
    ]);

    expect(result).toEqual(expect.objectContaining({
      tierLabel: 'A',
      totalVotes: 3,
      winningVotes: 2,
      tierIndex: 1,
    }));
    expect(result.rankingScore).toBeGreaterThan(0);
    expect(result.weightedAverage).toBeGreaterThan(0);
  });

  it('orders items within the same tier by ranking score when revealing votes', () => {
    const match = {
      id: 'tierlist-match-1',
      modeType: 'tierlist',
      phase: 'vote',
      itemIndex: 1,
      totalItems: 2,
      itemOrder: ['item-a', 'item-b'],
      allItems: {
        'item-a': { id: 'item-a', title: 'Item A' },
        'item-b': { id: 'item-b', title: 'Item B' },
      },
      tierRows: [
        { id: 'row-a', label: 'A', color: '#fa6', itemIds: ['item-a'] },
        { id: 'row-b', label: 'B', color: '#fd6', itemIds: [] },
      ],
      placements: {
        'item-a': {
          tierLabel: 'A',
          tierColor: '#fa6',
          voteCounts: { A: 2, B: 1 },
          totalVotes: 3,
          winningVotes: 2,
          weightedAverage: 1.667,
          rankingScore: 1769,
          tierIndex: 0,
          hostOverridden: false,
          placedAt: '2026-04-15T10:00:00.000Z',
        },
      },
      currentVote: {
        itemId: 'item-b',
        roundId: 'round-2',
        result: {
          tierLabel: 'A',
          tierColor: '#fa6',
          voteCounts: { A: 3, B: 0 },
          totalVotes: 3,
          winningVotes: 3,
          weightedAverage: 2,
          rankingScore: 2303,
          tierIndex: 0,
        },
      },
      settings: {
        revealSec: 5,
        voteSec: 12,
        showItemMs: 2000,
      },
    };

    const nextMatch = advancePartyTierlistMatch(match);

    expect(nextMatch.phase).toBe('reveal');
    expect(nextMatch.tierRows[0].itemIds).toEqual(['item-b', 'item-a']);
    expect(nextMatch.placements['item-b']).toEqual(expect.objectContaining({
      rankingScore: 2303,
      totalVotes: 3,
      winningVotes: 3,
      hostOverridden: false,
    }));
  });
});
