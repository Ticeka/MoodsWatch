import { create } from 'zustand';

/**
 * partyVoteStore — tracks local vote UI state for the current member.
 *
 * Key goals:
 *  - Track which song the member selected (not just a boolean) so we can
 *    show the correct highlighted button after reconnect/refresh.
 *  - Allow changing your vote during the vote window (change-vote UX).
 *  - Hydrate from answers already in the room store when the battle context
 *    changes so a refresh doesn't leave the UI clueless.
 *  - Reset cleanly when a new battle starts or a rematch happens.
 */
export const usePartyVoteStore = create((set, get) => ({
  modeType: 'vote',
  currentBattleId: null,
  selectedSongId: null,   // the actual song the member voted for (or null)
  hasVoted: false,        // derived convenience flag

  /**
   * Called when the active battle changes.
   * If existingVoteForBattle is provided (from DB answers) we hydrate the selected
   * song immediately so a refresh/reconnect shows the correct state.
   */
  setBattleContext: (battleId, existingVoteForBattle = null) => {
    const { currentBattleId, selectedSongId } = get();
    const normalizedExistingVote = existingVoteForBattle || null;
    const isSameBattle = battleId === currentBattleId;
    const isSameVote = normalizedExistingVote === (selectedSongId || null);

    if (isSameBattle && isSameVote) {
      return;
    }

    set({
      currentBattleId: battleId,
      selectedSongId: normalizedExistingVote,
      hasVoted: Boolean(normalizedExistingVote),
    });
  },

  /**
   * Record a vote locally (optimistic). Allows changing to a different song
   * by calling again with a new songId — mirrors the "change before time runs out" UX.
   */
  castVote: (songId) => set({
    selectedSongId: songId,
    hasVoted: true,
  }),

  /**
   * Full reset when going back to lobby (rematch).
   */
  resetVoteMatch: () => set({
    currentBattleId: null,
    selectedSongId: null,
    hasVoted: false,
  }),
}));
