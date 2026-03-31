import {
  getPartyRuntimeSongKey,
  normalizePartyVotePlaybackMode,
  shufflePartyItems,
} from './partyEngine';

// ─── Timing constants (centralised — no magic numbers in components) ────────
export const VOTE_PHASE_TIMING = {
  countdownMs:  3000,
  introMs:      1800,
  voteSec:      10,
  revealSec:    6,
  freezeMs:     1800,   // milliseconds at start of reveal where results are hidden
};

function makeId(prefix = 'party') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getVoteBracketSize(requestedCount, poolSize) {
  let normalizedRequested = [2, 4, 8, 16].includes(Number(requestedCount))
    ? Number(requestedCount)
    : null;

  if (!normalizedRequested) {
    if (poolSize >= 16) normalizedRequested = 16;
    else if (poolSize >= 8) normalizedRequested = 8;
    else if (poolSize >= 4) normalizedRequested = 4;
    else normalizedRequested = 2;
  }

  if (poolSize < normalizedRequested) {
    throw new Error(`Not enough playable songs for Vote Battle mode. Need at least ${normalizedRequested} songs.`);
  }

  return normalizedRequested;
}

/** Deterministic tie-break across all clients based on battle id hash. */
function tieBreak(battleId, songA, songB) {
  const hash = Array.from(String(battleId)).reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? songA : songB;
}

export function buildPartyVoteSnapshot(playablePool = [], settings = {}) {
  const poolSize = getVoteBracketSize(settings.entrantCount, playablePool.length);
  const shuffled = shufflePartyItems(playablePool).slice(0, poolSize);

  if (shuffled.length < 2) {
    throw new Error('Not enough playable songs for Vote Battle mode. Minimum 2 required.');
  }

  const allSongs = {};
  shuffled.forEach(song => {
    const songId = getPartyRuntimeSongKey(song);
    allSongs[songId] = {
      id: songId,
      themeType: song.themeType || 'OP',
      artistName: song.artistName || '',
      songTitle: song.songTitle || '',
      sourceTitleId: song.sourceTitleId,
      sourceTitleName: song.sourceTitleName || '',
      mediaUrl: song.mediaUrl || '',
      coverUrl: song.coverUrl || '',
      provider: song.provider || 'catalog',
      providerMediaId: song.providerMediaId || null,
    };
  });

  const songA_id = getPartyRuntimeSongKey(shuffled[0]);
  const songB_id = getPartyRuntimeSongKey(shuffled[1]);
  const queue = shuffled.slice(2).map((song) => getPartyRuntimeSongKey(song));
  const totalBattles = poolSize - 1;
  const now = Date.now();

  const t = VOTE_PHASE_TIMING;
  const voteSec = Number(settings.voteSec || t.voteSec);
  const revealSec = Number(settings.revealSec || t.revealSec);
  const clipPlaybackMode = normalizePartyVotePlaybackMode(settings.clipPlaybackMode);

  return {
    id: makeId('vote-match'),
    modeType: 'vote',
    phase: 'countdown',
    entrantCount: poolSize,
    battleIndex: 1,
    totalBattles,
    championSongId: null,   // set only when phase === 'final'
    queue,
    allSongs,
    currentBattle: {
      id: makeId('battle'),
      songA: songA_id,
      songB: songB_id,
      winnerSongId: null,
      voteSummary: {
        songA_votes: 0,
        songB_votes: 0,
        total_votes: 0,
        winning_song_id: null,
        is_tie: false,
      },
    },
    settings: {
      clipPlaybackMode,
      previewSec: settings.timePerRoundSec || 12,
      voteSec,
      revealSec,
      freezeMs: t.freezeMs,
    },
    phaseStartedAt: new Date(now).toISOString(),
    phaseEndsAt: new Date(now + t.countdownMs).toISOString(),
  };
}

export function advancePartyVoteMatch(match) {
  if (!match || match.modeType !== 'vote') return null;

  const now = Date.now();
  // Deep-clone only the fields that will be mutated.
  const nextMatch = {
    ...match,
    currentBattle: { ...match.currentBattle },
    queue: [...(match.queue || [])],
    settings: { ...match.settings },
  };
  const s = nextMatch.settings;
  const t = VOTE_PHASE_TIMING;

  switch (nextMatch.phase) {
    case 'countdown':
      nextMatch.phase = 'intro-a';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + t.introMs).toISOString();
      break;

    case 'intro-a':
      nextMatch.phase = 'play-a';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = null;
      break;

    case 'play-a':
      nextMatch.phase = 'intro-b';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + t.introMs).toISOString();
      break;

    case 'intro-b':
      nextMatch.phase = 'play-b';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = null;
      break;

    case 'play-b':
      nextMatch.phase = 'vote';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + ((s.voteSec ?? t.voteSec) * 1000)).toISOString();
      break;

    case 'vote': {
      // NOTE: vote tally is done in partyRemote.advancePartyRoom BEFORE calling
      // this function so currentBattle.winnerSongId should already be set.
      // If somehow missing (local-only path), fall back to tie-break.
      if (!nextMatch.currentBattle.winnerSongId) {
        const summary = nextMatch.currentBattle.voteSummary;
        let winnerId;
        if ((summary.songA_votes || 0) > (summary.songB_votes || 0)) {
          winnerId = nextMatch.currentBattle.songA;
        } else if ((summary.songB_votes || 0) > (summary.songA_votes || 0)) {
          winnerId = nextMatch.currentBattle.songB;
        } else {
          winnerId = tieBreak(
            nextMatch.currentBattle.id,
            nextMatch.currentBattle.songA,
            nextMatch.currentBattle.songB,
          );
          summary.is_tie = true;
        }
        nextMatch.currentBattle.winnerSongId = winnerId;
        summary.winning_song_id = winnerId;
      }
      // Push winner back into queue for next bracket round.
      nextMatch.queue.push(nextMatch.currentBattle.winnerSongId);

      nextMatch.phase = 'reveal';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + ((s.revealSec ?? t.revealSec) * 1000)).toISOString();
      break;
    }

    case 'reveal': {
      const isFinal = nextMatch.battleIndex >= nextMatch.totalBattles || nextMatch.queue.length < 2;
      if (isFinal) {
        // Champion is the lone survivor in the queue.
        const champId = nextMatch.queue[0] || nextMatch.currentBattle.winnerSongId;
        nextMatch.phase = 'final';
        nextMatch.championSongId = champId;
        nextMatch.phaseStartedAt = new Date(now).toISOString();
        nextMatch.phaseEndsAt = null;
      } else {
        nextMatch.phase = 'countdown';
        nextMatch.battleIndex += 1;
        const nextA = nextMatch.queue.shift();
        const nextB = nextMatch.queue.shift();
        nextMatch.currentBattle = {
          id: makeId('battle'),
          songA: nextA,
          songB: nextB,
          winnerSongId: null,
          voteSummary: {
            songA_votes: 0,
            songB_votes: 0,
            total_votes: 0,
            winning_song_id: null,
            is_tie: false,
          },
        };
        nextMatch.phaseStartedAt = new Date(now).toISOString();
        nextMatch.phaseEndsAt = new Date(now + t.countdownMs).toISOString();
      }
      break;
    }

    default:
      break;
  }

  return nextMatch;
}
