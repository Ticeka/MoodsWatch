/**
 * Tests for the Party Vote Battle mode engine.
 * Covers: snapshot building, phase transitions, vote tallying,
 * tie-breaking, queue progression, and champion resolution.
 */
import { describe, test, expect } from 'vitest';
import {
  buildPartyVoteSnapshot,
  advancePartyVoteMatch,
  VOTE_PHASE_TIMING,
} from '../partyModeVote';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSong(id) {
  return {
    id,
    songTitle: `Song ${id}`,
    sourceTitleName: `Source ${id}`,
    artistName: 'Artist',
    mediaUrl: `https://example.com/${id}.mp4`,
    coverUrl: `https://example.com/${id}.jpg`,
    themeType: 'OP',
  };
}

function makeYoutubeSong(videoId) {
  return {
    id: 0,
    provider: 'youtube',
    providerMediaId: videoId,
    songTitle: `YT ${videoId}`,
    sourceTitleName: `YT Source ${videoId}`,
    artistName: 'YT Artist',
    mediaUrl: '',
    coverUrl: `https://img.youtube.com/${videoId}.jpg`,
    themeType: 'OP',
  };
}

function makeImageOnlySong(id) {
  return {
    id,
    songTitle: `Image ${id}`,
    sourceTitleName: `Source ${id}`,
    artistName: '',
    mediaUrl: '',
    coverUrl: `https://example.com/${id}.jpg`,
    themeType: 'OP',
  };
}

const FOUR_SONGS = ['a', 'b', 'c', 'd'].map(makeSong);
const FOUR_IMAGE_ONLY_SONGS = ['ia', 'ib', 'ic', 'id'].map(makeImageOnlySong);
const TWO_SONGS = ['x', 'y'].map(makeSong);
const ONE_SONG = ['lone'].map(makeSong);

// ─── buildPartyVoteSnapshot ───────────────────────────────────────────────

describe('buildPartyVoteSnapshot', () => {
  test('builds a valid snapshot from 4 songs (bracket size 4)', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {});
    expect(snap.modeType).toBe('vote');
    expect(snap.phase).toBe('countdown');
    expect(snap.entrantCount).toBe(4);
    expect(snap.totalBattles).toBe(3);
    expect(Object.keys(snap.allSongs)).toHaveLength(4);
    expect(snap.currentBattle.songA).toBeDefined();
    expect(snap.currentBattle.songB).toBeDefined();
    expect(typeof snap.currentBattle.songA).toBe('string');
    expect(typeof snap.currentBattle.songB).toBe('string');
    expect(snap.queue).toHaveLength(2);
    expect(snap.championSongId).toBeNull();
  });

  test('builds from 2 songs (minimum bracket)', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, {});
    expect(snap.entrantCount).toBe(2);
    expect(snap.totalBattles).toBe(1);
    expect(snap.queue).toHaveLength(0);
  });

  test('throws when fewer than 2 songs provided', () => {
    expect(() => buildPartyVoteSnapshot(ONE_SONG, {})).toThrow();
    expect(() => buildPartyVoteSnapshot([], {})).toThrow();
  });

  test('respects previewSec from settings', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, { timePerRoundSec: 20 });
    expect(snap.settings.previewSec).toBe(20);
  });

  test('respects custom vote and reveal settings', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {
      entrantCount: 4,
      timePerRoundSec: 15,
      voteSec: 12,
      revealSec: 8,
    });

    expect(snap.entrantCount).toBe(4);
    expect(snap.settings.previewSec).toBe(15);
    expect(snap.settings.voteSec).toBe(12);
    expect(snap.settings.revealSec).toBe(8);
  });

  test('includes timing constants from VOTE_PHASE_TIMING', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, {});
    expect(snap.settings.voteSec).toBe(VOTE_PHASE_TIMING.voteSec);
    expect(snap.settings.revealSec).toBe(VOTE_PHASE_TIMING.revealSec);
    expect(snap.settings.freezeMs).toBe(VOTE_PHASE_TIMING.freezeMs);
  });

  test('stores the requested vote playback mode in the snapshot settings', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, { clipPlaybackMode: 'full' });
    expect(snap.settings.clipPlaybackMode).toBe('full');
  });

  test('keeps YouTube songs distinct by providerMediaId instead of colliding on id=0', () => {
    const youtubeSongs = [
      makeYoutubeSong('video-a'),
      makeYoutubeSong('video-b'),
      makeYoutubeSong('video-c'),
      makeYoutubeSong('video-d'),
    ];

    const snap = buildPartyVoteSnapshot(youtubeSongs, {});
    const allSongIds = Object.keys(snap.allSongs);

    expect(allSongIds).toHaveLength(4);
    expect(allSongIds).toContain('yt:video-a');
    expect(allSongIds).toContain('yt:video-b');
    expect(snap.currentBattle.songA).not.toBe(snap.currentBattle.songB);
    expect(snap.allSongs[snap.currentBattle.songA]?.providerMediaId).toBeTruthy();
    expect(snap.allSongs[snap.currentBattle.songB]?.providerMediaId).toBeTruthy();
  });
});

// ─── Phase transition order ──────────────────────────────────────────────────

describe('advancePartyVoteMatch — phase transitions', () => {
  const PHASE_ORDER = ['countdown', 'intro-a', 'play-a', 'intro-b', 'play-b', 'vote'];

  test('phases advance in the correct sequence', () => {
    let match = buildPartyVoteSnapshot(FOUR_SONGS, {});
    const expectedSequence = [
      'intro-a', 'play-a', 'intro-b', 'play-b', 'vote', 'reveal',
    ];
    for (const expectedPhase of expectedSequence) {
      // Provide a winner so vote->reveal doesn't get stuck without one.
      if (match.phase === 'vote') {
        match = {
          ...match,
          currentBattle: {
            ...match.currentBattle,
            winnerSongId: match.currentBattle.songA,
            voteSummary: { songA_votes: 3, songB_votes: 1, total_votes: 4, winning_song_id: match.currentBattle.songA, is_tie: false },
          },
        };
      }
      match = advancePartyVoteMatch(match);
      expect(match.phase).toBe(expectedPhase);
    }
  });

  test('phaseEndsAt is set for timed phases and omitted for media-driven play phases', () => {
    let match = buildPartyVoteSnapshot(TWO_SONGS, {});
    let iterations = 0;
    while (match.phase !== 'final' && iterations < 20) {
      if (match.phase === 'vote') {
        match = {
          ...match,
          currentBattle: {
            ...match.currentBattle,
            winnerSongId: match.currentBattle.songA,
            voteSummary: { songA_votes: 1, songB_votes: 0, total_votes: 1, winning_song_id: match.currentBattle.songA, is_tie: false },
          },
        };
      }
      match = advancePartyVoteMatch(match);
      if (match.phase !== 'final') {
        if (match.phase === 'play-a' || match.phase === 'play-b') {
          expect(match.phaseEndsAt).toBeNull();
        } else {
          expect(match.phaseEndsAt).toBeTruthy();
        }
      }
      iterations++;
    }
  });

  test('skips playback phases for image-only contenders', () => {
    let match = buildPartyVoteSnapshot(FOUR_IMAGE_ONLY_SONGS, {});

    match = advancePartyVoteMatch(match);
    expect(match.phase).toBe('intro-a');
    expect(match.phaseEndsAt).toBeTruthy();

    match = advancePartyVoteMatch(match);
    expect(match.phase).toBe('intro-b');
    expect(match.phaseEndsAt).toBeTruthy();

    match = advancePartyVoteMatch(match);
    expect(match.phase).toBe('vote');
    expect(match.phaseEndsAt).toBeTruthy();
  });

  test('only skips the playback phase for image-only songs', () => {
    const mixedSongs = [
      makeImageOnlySong('image-a'),
      makeSong('song-b'),
      makeSong('song-c'),
      makeSong('song-d'),
    ];
    let match = buildPartyVoteSnapshot(mixedSongs, { entrantCount: 4 });
    match = {
      ...match,
      currentBattle: {
        ...match.currentBattle,
        songA: Object.keys(match.allSongs).find((id) => match.allSongs[id]?.isImageOnly) || match.currentBattle.songA,
        songB: Object.keys(match.allSongs).find((id) => !match.allSongs[id]?.isImageOnly && id !== match.currentBattle.songA) || match.currentBattle.songB,
      },
    };

    match = advancePartyVoteMatch(match);
    expect(match.phase).toBe('intro-a');

    match = advancePartyVoteMatch(match);
    expect(match.phase).toBe('intro-b');

    match = advancePartyVoteMatch(match);
    expect(match.phase).toBe('play-b');
    expect(match.phaseEndsAt).toBeNull();
  });
});

// ─── Vote tally & winner resolution ───────────────────────────────────────

describe('advancePartyVoteMatch — vote resolution', () => {
  function makeMatchAtVote(songA_votes, songB_votes) {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {});
    return {
      ...snap,
      phase: 'vote',
      currentBattle: {
        ...snap.currentBattle,
        winnerSongId: null,
        voteSummary: {
          songA_votes,
          songB_votes,
          total_votes: songA_votes + songB_votes,
          winning_song_id: null,
          is_tie: false,
        },
      },
    };
  }

  test('A wins when A has more votes', () => {
    const match = makeMatchAtVote(5, 2);
    const next = advancePartyVoteMatch(match);
    expect(next.phase).toBe('reveal');
    expect(next.currentBattle.winnerSongId).toBe(match.currentBattle.songA);
    expect(next.currentBattle.voteSummary.winning_song_id).toBe(match.currentBattle.songA);
  });

  test('B wins when B has more votes', () => {
    const match = makeMatchAtVote(2, 5);
    const next = advancePartyVoteMatch(match);
    expect(next.currentBattle.winnerSongId).toBe(match.currentBattle.songB);
  });

  test('tie-break is deterministic (same battleId always yields same winner)', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {});
    const tied = {
      ...snap,
      phase: 'vote',
      currentBattle: {
        ...snap.currentBattle,
        id: 'battle-deterministic-id',
        winnerSongId: null,
        voteSummary: { songA_votes: 3, songB_votes: 3, total_votes: 6, winning_song_id: null, is_tie: false },
      },
    };
    const winner1 = advancePartyVoteMatch(tied).currentBattle.winnerSongId;
    const winner2 = advancePartyVoteMatch(tied).currentBattle.winnerSongId;
    expect(winner1).toBe(winner2);
    expect(winner1).toBeDefined();
  });

  test('winner is pushed to queue after vote->reveal', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {});
    const queueLengthBefore = snap.queue.length;
    const atVote = {
      ...snap,
      phase: 'vote',
      currentBattle: {
        ...snap.currentBattle,
        winnerSongId: snap.currentBattle.songA,
        voteSummary: { songA_votes: 3, songB_votes: 1, total_votes: 4, winning_song_id: snap.currentBattle.songA, is_tie: false },
      },
    };
    const reveal = advancePartyVoteMatch(atVote);
    expect(reveal.queue.length).toBe(queueLengthBefore + 1);
    expect(reveal.queue[reveal.queue.length - 1]).toBe(snap.currentBattle.songA);
  });
});

// ─── Queue progression & final ──────────────────────────────────────────────

describe('advancePartyVoteMatch — bracket progression', () => {
  function advanceFully(match) {
    let m = match;
    let safety = 0;
    while (m.phase !== 'final' && safety < 50) {
      if (m.phase === 'vote') {
        m = {
          ...m,
          currentBattle: {
            ...m.currentBattle,
            winnerSongId: m.currentBattle.songA,
            voteSummary: { songA_votes: 2, songB_votes: 1, total_votes: 3, winning_song_id: m.currentBattle.songA, is_tie: false },
          },
        };
      }
      m = advancePartyVoteMatch(m);
      safety++;
    }
    return m;
  }

  test('2-song bracket reaches final after 1 battle', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, {});
    const final = advanceFully(snap);
    expect(final.phase).toBe('final');
    expect(final.totalBattles).toBe(1);
  });

  test('4-song bracket reaches final after 3 battles', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {});
    const final = advanceFully(snap);
    expect(final.phase).toBe('final');
    expect(final.battleIndex).toBe(3);
  });

  test('championSongId is set when reaching final', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, {});
    const final = advanceFully(snap);
    expect(final.championSongId).toBeTruthy();
    expect(Object.keys(final.allSongs)).toContain(final.championSongId);
  });

  test('phaseEndsAt is null on final phase', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, {});
    const final = advanceFully(snap);
    expect(final.phaseEndsAt).toBeNull();
  });

  test('battleIndex increments correctly over bracket', () => {
    const snap = buildPartyVoteSnapshot(FOUR_SONGS, {});
    let m = snap;
    const battleIndices = new Set();
    let safety = 0;
    while (m.phase !== 'final' && safety < 50) {
      if (m.phase === 'vote') {
        m = {
          ...m,
          currentBattle: {
            ...m.currentBattle,
            winnerSongId: m.currentBattle.songA,
            voteSummary: { songA_votes: 1, songB_votes: 0, total_votes: 1, winning_song_id: m.currentBattle.songA, is_tie: false },
          },
        };
      }
      m = advancePartyVoteMatch(m);
      if (m.phase === 'countdown' || m.phase === 'final') {
        battleIndices.add(m.battleIndex);
      }
      safety++;
    }
    // Should have seen battleIndex 2, 3 (after each reveal) plus final
    expect([...battleIndices].every(i => i >= 1 && i <= 3)).toBe(true);
  });
});

// ─── Immutability guard ──────────────────────────────────────────────────────

describe('advancePartyVoteMatch — immutability', () => {
  test('does not mutate the original match', () => {
    const snap = buildPartyVoteSnapshot(TWO_SONGS, {});
    const originalPhase = snap.phase;
    const originalQueueLen = snap.queue.length;
    advancePartyVoteMatch(snap);
    expect(snap.phase).toBe(originalPhase);
    expect(snap.queue.length).toBe(originalQueueLen);
  });
});
