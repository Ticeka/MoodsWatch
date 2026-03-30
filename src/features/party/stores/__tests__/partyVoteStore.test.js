import { beforeEach, describe, expect, it } from 'vitest';
import { usePartyVoteStore } from '../partyVoteStore';

describe('partyVoteStore', () => {
  beforeEach(() => {
    usePartyVoteStore.getState().resetVoteMatch();
  });

  it('hydrates an existing vote when entering a battle', () => {
    usePartyVoteStore.getState().setBattleContext('battle-1', 'song-a');

    expect(usePartyVoteStore.getState()).toEqual(expect.objectContaining({
      currentBattleId: 'battle-1',
      selectedSongId: 'song-a',
      hasVoted: true,
    }));
  });

  it('re-hydrates when the vote arrives later for the same battle', () => {
    usePartyVoteStore.getState().setBattleContext('battle-1', null);
    usePartyVoteStore.getState().setBattleContext('battle-1', 'song-b');

    expect(usePartyVoteStore.getState()).toEqual(expect.objectContaining({
      currentBattleId: 'battle-1',
      selectedSongId: 'song-b',
      hasVoted: true,
    }));
  });

  it('allows changing the selected vote locally', () => {
    usePartyVoteStore.getState().setBattleContext('battle-1', 'song-a');
    usePartyVoteStore.getState().castVote('song-b');

    expect(usePartyVoteStore.getState()).toEqual(expect.objectContaining({
      currentBattleId: 'battle-1',
      selectedSongId: 'song-b',
      hasVoted: true,
    }));
  });
});
