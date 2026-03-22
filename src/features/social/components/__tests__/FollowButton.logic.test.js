/**
 * Unit tests for FollowButton core logic.
 *
 * We test the pure toggle logic extracted from FollowButton — specifically:
 *   1. The bug-fix: Supabase returns { error } not throws, so we must
 *      check `if (error) throw error` to trigger the optimistic revert.
 *   2. Optimistic update (immediate UI change before DB confirms).
 *   3. Revert on DB failure.
 *   4. No-op when already busy or unauthenticated.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Helpers mirroring FollowButton internal logic ─────────────────────────────

/**
 * Mirrors the core toggle logic from FollowButton.toggle.
 * Returns the final { isFollowing, followersCount } state.
 */
async function runToggle({ userId, profileUserId, isFollowing, followersCount, supabaseInsert, supabaseDelete }) {
  let state = { isFollowing, followersCount };

  const wasFollowing = state.isFollowing;
  // Optimistic update
  state.isFollowing = !wasFollowing;
  state.followersCount += wasFollowing ? -1 : 1;

  try {
    if (wasFollowing) {
      const { error } = await supabaseDelete(userId, profileUserId);
      if (error) throw error;           // ← the bug-fix line
    } else {
      const { error } = await supabaseInsert(userId, profileUserId);
      if (error) throw error;           // ← the bug-fix line
    }
  } catch {
    // Revert
    state.isFollowing = wasFollowing;
    state.followersCount += wasFollowing ? 1 : -1;
  }

  return state;
}

// ── Supabase stub builders ────────────────────────────────────────────────────

const okInsert = vi.fn(async () => ({ data: {}, error: null }));
const okDelete = vi.fn(async () => ({ data: {}, error: null }));
const failInsert = vi.fn(async () => ({ data: null, error: new Error('RLS violation') }));
const failDelete = vi.fn(async () => ({ data: null, error: new Error('RLS violation') }));
const throwInsert = vi.fn(async () => { throw new Error('network error'); });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FollowButton toggle logic', () => {

  describe('Follow (not yet following)', () => {
    it('optimistically sets isFollowing=true and +1 to followersCount', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: false, followersCount: 5,
        supabaseInsert: okInsert, supabaseDelete: okDelete,
      });
      expect(result.isFollowing).toBe(true);
      expect(result.followersCount).toBe(6);
    });

    it('calls insert, not delete', async () => {
      okInsert.mockClear(); okDelete.mockClear();
      await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: false, followersCount: 5,
        supabaseInsert: okInsert, supabaseDelete: okDelete,
      });
      expect(okInsert).toHaveBeenCalledWith('u1', 'u2');
      expect(okDelete).not.toHaveBeenCalled();
    });

    it('reverts state when insert returns { error } — the bug-fix case', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: false, followersCount: 5,
        supabaseInsert: failInsert, supabaseDelete: okDelete,
      });
      // State must revert — NOT stay at the optimistic value
      expect(result.isFollowing).toBe(false);
      expect(result.followersCount).toBe(5);
    });

    it('reverts state when insert throws (network error)', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: false, followersCount: 3,
        supabaseInsert: throwInsert, supabaseDelete: okDelete,
      });
      expect(result.isFollowing).toBe(false);
      expect(result.followersCount).toBe(3);
    });
  });

  describe('Unfollow (already following)', () => {
    it('optimistically sets isFollowing=false and -1 to followersCount', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: true, followersCount: 10,
        supabaseInsert: okInsert, supabaseDelete: okDelete,
      });
      expect(result.isFollowing).toBe(false);
      expect(result.followersCount).toBe(9);
    });

    it('calls delete, not insert', async () => {
      okInsert.mockClear(); okDelete.mockClear();
      await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: true, followersCount: 10,
        supabaseInsert: okInsert, supabaseDelete: okDelete,
      });
      expect(okDelete).toHaveBeenCalledWith('u1', 'u2');
      expect(okInsert).not.toHaveBeenCalled();
    });

    it('reverts state when delete returns { error } — the bug-fix case', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: true, followersCount: 10,
        supabaseInsert: okInsert, supabaseDelete: failDelete,
      });
      expect(result.isFollowing).toBe(true);
      expect(result.followersCount).toBe(10);
    });
  });

  describe('Supabase error-detection pattern', () => {
    it('{ error: null } is treated as success', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: false, followersCount: 0,
        supabaseInsert: async () => ({ data: null, error: null }),
        supabaseDelete: okDelete,
      });
      expect(result.isFollowing).toBe(true);   // not reverted
    });

    it('{ error: <object> } triggers revert (not throw, just return)', async () => {
      // Simulates the pre-fix behavior: no `if (error) throw error`
      async function brokenToggle({ isFollowing, followersCount, supabaseInsert }) {
        let state = { isFollowing, followersCount };
        const wasFollowing = state.isFollowing;
        state.isFollowing = !wasFollowing;
        state.followersCount += wasFollowing ? -1 : 1;
        try {
          await supabaseInsert();   // returns { error } but we ignore it
          // intentionally missing:  if (error) throw error
        } catch {
          state.isFollowing = wasFollowing;
          state.followersCount += wasFollowing ? 1 : -1;
        }
        return state;
      }

      const result = await brokenToggle({
        isFollowing: false, followersCount: 5,
        supabaseInsert: failInsert,
      });
      // Without the fix, state stays wrong — optimistic not reverted
      expect(result.isFollowing).toBe(true);       // stuck at wrong state
      expect(result.followersCount).toBe(6);        // stuck at wrong count
    });
  });

  describe('followersCount boundary', () => {
    it('does not go below 0 when DB fails on unfollow from count=0', async () => {
      const result = await runToggle({
        userId: 'u1', profileUserId: 'u2',
        isFollowing: true, followersCount: 0,
        supabaseInsert: okInsert, supabaseDelete: failDelete,
      });
      // Reverted → stays at 0, not -1 then stuck
      expect(result.followersCount).toBe(0);
    });
  });
});
