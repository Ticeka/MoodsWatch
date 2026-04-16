import { shufflePartyItems } from './partyEngine';

// ─── Timing constants ────────────────────────────────────────────────────────
export const TIERLIST_PHASE_TIMING = {
  countdownMs:  3000,
  showItemMs:   2000,
  voteSec:      12,
  revealSec:    5,
  freezeMs:     1200,
};

// ─── Default tier rows ───────────────────────────────────────────────────────
export const DEFAULT_TIERLIST_ROWS = [
  { label: 'S', color: '#ff7f7f' },
  { label: 'A', color: '#ffbf7f' },
  { label: 'B', color: '#ffdf7f' },
  { label: 'C', color: '#ffff7f' },
  { label: 'D', color: '#bfff7f' },
];

const HOST_OVERRIDE_RANKING_SCORE = -1;

function makeId(prefix = 'party') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a tierlist item from a tierlist template item or custom item.
 * Supports title entities, character entities, custom images, text, etc.
 */
function buildTierlistItem(raw, index) {
  const id = String(raw?.id ?? raw?.titleId ?? index);
  return {
    id,
    title: String(raw?.title ?? raw?.name ?? raw?.title_en ?? '').trim(),
    imageUrl: String(raw?.imageUrl ?? raw?.image_url ?? raw?.coverUrl ?? raw?.cover_url ?? '').trim(),
    subtitle: String(raw?.subtitle ?? raw?.artistName ?? raw?.artist_name ?? '').trim(),
    entityType: String(raw?.entityType ?? raw?.entity_type ?? 'title').trim(),
    mediaUrl: String(raw?.mediaUrl ?? raw?.media_url ?? raw?.videoUrl ?? raw?.video_url ?? '').trim(),
    provider: String(raw?.provider || '').trim(),
    providerMediaId: String(raw?.providerMediaId ?? raw?.provider_media_id ?? raw?.trailerVideoId ?? raw?.trailer_video_id ?? '').trim(),
    trailerSite: String(raw?.trailerSite ?? raw?.trailer_site ?? '').trim(),
    isVideo: Boolean(raw?.isVideo)
      || Boolean(raw?.mediaUrl ?? raw?.media_url ?? raw?.videoUrl ?? raw?.video_url)
      || Boolean(raw?.providerMediaId ?? raw?.provider_media_id ?? raw?.trailerVideoId ?? raw?.trailer_video_id),
  };
}

/**
 * Build the initial match snapshot for a Party Tierlist session.
 *
 * @param {Array} items - Array of tierlist template items
 * @param {Object} settings - Room settings
 * @returns {Object} match snapshot (stored in current_match)
 */
export function buildPartyTierlistSnapshot(items = [], settings = {}) {
  if (!items || items.length < 1) {
    throw new Error('Need at least 1 item to start a Party Tierlist.');
  }

  const maxItems = Math.min(items.length, Number(settings.tierlistItemCount) || items.length);
  const shuffled = settings.randomOrder !== false
    ? shufflePartyItems(items).slice(0, maxItems)
    : items.slice(0, maxItems);

  const allItems = {};
  shuffled.forEach((raw, index) => {
    const item = buildTierlistItem(raw, index);
    allItems[item.id] = item;
  });

  const itemOrder = shuffled.map((raw, index) => String(raw?.id ?? raw?.titleId ?? index));

  // Tier rows (host-customisable, with sensible defaults)
  const tierRows = (
    Array.isArray(settings.tierlistRows) && settings.tierlistRows.length > 0
      ? settings.tierlistRows
      : DEFAULT_TIERLIST_ROWS
  ).map((row, i) => ({
    id: makeId('tier'),
    label: String(row?.label || DEFAULT_TIERLIST_ROWS[i]?.label || String.fromCharCode(65 + i)),
    color: String(row?.color || DEFAULT_TIERLIST_ROWS[i]?.color || '#cccccc'),
    itemIds: [],
  }));

  const now = Date.now();
  const t = TIERLIST_PHASE_TIMING;
  const voteSec = Number(settings.tierlistVoteSec || t.voteSec);
  const revealSec = Number(settings.tierlistRevealSec || t.revealSec);

  return {
    id: makeId('tierlist-match'),
    modeType: 'tierlist',
    phase: 'countdown',
    itemIndex: 0,
    totalItems: itemOrder.length,
    itemOrder,
    allItems,
    tierRows,
    // Results: which tier each item was placed in
    placements: {},    // { [itemId]: { tierLabel, tierColor, votes } }
    currentVote: null, // set during vote phase
    settings: {
      voteSec,
      revealSec,
      freezeMs: t.freezeMs,
      showItemMs: t.showItemMs,
    },
    // Host override state
    hostOverride: null, // { action: 'skip' | 'extend' | 'reorder' | 'place', ... }
    phaseStartedAt: new Date(now).toISOString(),
    phaseEndsAt: new Date(now + t.countdownMs).toISOString(),
  };
}

/**
 * Tally votes from answers and determine winning tier.
 * Returns { tierLabel, tierColor, voteCounts, totalVotes }
 */
export function tallyTierlistVotes(tierRows, votes = []) {
  const voteCounts = {};
  tierRows.forEach((row) => { voteCounts[row.label] = 0; });

  votes.forEach((vote) => {
    const tierLabel = String(vote?.selected_option_id || vote?.tierLabel || '').trim();
    if (tierLabel in voteCounts) {
      voteCounts[tierLabel] += 1;
    }
  });

  const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);

  // Find winning tier (highest votes, tie = higher tier wins)
  let winningLabel = tierRows[Math.floor(tierRows.length / 2)]?.label || 'C';
  let winningMax = -1;
  tierRows.forEach((row) => {
    if (voteCounts[row.label] > winningMax) {
      winningMax = voteCounts[row.label];
      winningLabel = row.label;
    }
  });

  const winningRow = tierRows.find((row) => row.label === winningLabel) || tierRows[0];
  const winningTierIndex = Math.max(0, tierRows.findIndex((row) => row.label === winningLabel));
  const maxTierWeight = Math.max(1, tierRows.length);

  const weightedPoints = tierRows.reduce((sum, row, index) => (
    sum + (Number(voteCounts[row.label] || 0) * Math.max(1, maxTierWeight - index))
  ), 0);
  const weightedAverage = totalVotes > 0 ? weightedPoints / totalVotes : Math.max(1, maxTierWeight - winningTierIndex);
  const rankingScore = Number((weightedAverage * 1000) + (winningMax * 100) + totalVotes).toFixed(3);

  return {
    tierLabel: winningLabel,
    tierColor: winningRow?.color || '#cccccc',
    voteCounts,
    totalVotes,
    winningVotes: Math.max(0, winningMax),
    tierIndex: winningTierIndex,
    weightedAverage,
    rankingScore: Number(rankingScore),
  };
}

function compareTierlistPlacement(a = {}, b = {}) {
  const leftScore = Number(a.rankingScore ?? HOST_OVERRIDE_RANKING_SCORE);
  const rightScore = Number(b.rankingScore ?? HOST_OVERRIDE_RANKING_SCORE);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftWinningVotes = Number(a.winningVotes || 0);
  const rightWinningVotes = Number(b.winningVotes || 0);
  if (leftWinningVotes !== rightWinningVotes) {
    return rightWinningVotes - leftWinningVotes;
  }

  const leftTotalVotes = Number(a.totalVotes || 0);
  const rightTotalVotes = Number(b.totalVotes || 0);
  if (leftTotalVotes !== rightTotalVotes) {
    return rightTotalVotes - leftTotalVotes;
  }

  const leftPlacedAt = new Date(a.placedAt || 0).getTime();
  const rightPlacedAt = new Date(b.placedAt || 0).getTime();
  return leftPlacedAt - rightPlacedAt;
}

function placeTierlistItem(row, itemId, placements = {}) {
  if (!row || !itemId) {
    return;
  }

  const nextItemIds = Array.isArray(row.itemIds)
    ? row.itemIds.filter((existingId) => String(existingId) !== String(itemId))
    : [];

  nextItemIds.push(itemId);
  nextItemIds.sort((leftId, rightId) => compareTierlistPlacement(
    placements[leftId] || {},
    placements[rightId] || {},
  ));
  row.itemIds = nextItemIds;
}

/**
 * Advance the tierlist match to the next phase.
 * Phase flow: countdown → show-item → vote → reveal → (next countdown or final)
 *
 * Host can inject overrides via match.hostOverride before calling this.
 */
export function advancePartyTierlistMatch(match) {
  if (!match || match.modeType !== 'tierlist') return null;

  const now = Date.now();
  const nextMatch = {
    ...match,
    tierRows: match.tierRows.map((row) => ({ ...row, itemIds: [...row.itemIds] })),
    placements: { ...match.placements },
    itemOrder: [...match.itemOrder],
    settings: { ...match.settings },
  };
  const s = nextMatch.settings;
  const t = TIERLIST_PHASE_TIMING;

  // Handle host override: skip current item
  if (nextMatch.hostOverride?.action === 'skip') {
    // Remove current item from queue, don't place it
    nextMatch.hostOverride = null;
    const hasMore = nextMatch.itemIndex + 1 < nextMatch.totalItems;
    if (hasMore) {
      nextMatch.itemIndex += 1;
      nextMatch.phase = 'countdown';
      nextMatch.currentVote = null;
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + t.countdownMs).toISOString();
    } else {
      nextMatch.phase = 'final';
      nextMatch.currentVote = null;
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = null;
    }
    return nextMatch;
  }

  // Handle host override: force-place item in a specific tier
  if (nextMatch.hostOverride?.action === 'place') {
    const forcedTierLabel = nextMatch.hostOverride.tierLabel;
    const currentItemId = nextMatch.itemOrder[nextMatch.itemIndex];
    nextMatch.hostOverride = null;

    if (currentItemId && forcedTierLabel) {
      const targetRow = nextMatch.tierRows.find((r) => r.label === forcedTierLabel);
      if (targetRow) {
        nextMatch.placements[currentItemId] = {
          tierLabel: forcedTierLabel,
          tierColor: targetRow.color,
          voteCounts: {},
          totalVotes: 0,
          winningVotes: 0,
          weightedAverage: 0,
          rankingScore: HOST_OVERRIDE_RANKING_SCORE,
          tierIndex: Math.max(0, nextMatch.tierRows.findIndex((row) => row.label === forcedTierLabel)),
          hostOverridden: true,
          placedAt: new Date(now).toISOString(),
        };
        placeTierlistItem(targetRow, currentItemId, nextMatch.placements);
      }
    }

    const hasMore = nextMatch.itemIndex + 1 < nextMatch.totalItems;
    if (hasMore) {
      nextMatch.itemIndex += 1;
      nextMatch.phase = 'countdown';
      nextMatch.currentVote = null;
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + t.countdownMs).toISOString();
    } else {
      nextMatch.phase = 'final';
      nextMatch.currentVote = null;
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = null;
    }
    return nextMatch;
  }

  switch (nextMatch.phase) {
    case 'countdown': {
      nextMatch.phase = 'show-item';
      nextMatch.currentVote = {
        itemId: nextMatch.itemOrder[nextMatch.itemIndex],
        roundId: makeId('tl-round'),
      };
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + (s.showItemMs ?? t.showItemMs)).toISOString();
      break;
    }

    case 'show-item': {
      nextMatch.phase = 'vote';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + ((s.voteSec ?? t.voteSec) * 1000)).toISOString();
      break;
    }

    case 'vote': {
      // Vote tally should be done BEFORE calling this (in partyRemoteApi),
      // similar to how vote battle works.
      // currentVote.result should be set by the caller.
      if (!nextMatch.currentVote?.result) {
        // Fallback: place in middle tier
        const midIndex = Math.floor(nextMatch.tierRows.length / 2);
        const midRow = nextMatch.tierRows[midIndex];
        nextMatch.currentVote = {
          ...nextMatch.currentVote,
          result: {
            tierLabel: midRow.label,
            tierColor: midRow.color,
            voteCounts: {},
            totalVotes: 0,
            winningVotes: 0,
            weightedAverage: 0,
            rankingScore: 0,
            tierIndex: midIndex,
          },
        };
      }

      // Place item into the winning tier
      const currentItemId = nextMatch.currentVote.itemId;
      const result = nextMatch.currentVote.result;
      const targetRow = nextMatch.tierRows.find((r) => r.label === result.tierLabel);
      if (currentItemId) {
        nextMatch.placements[currentItemId] = {
          tierLabel: result.tierLabel,
          tierColor: result.tierColor,
          voteCounts: result.voteCounts,
          totalVotes: result.totalVotes,
          winningVotes: result.winningVotes,
          weightedAverage: result.weightedAverage,
          rankingScore: result.rankingScore,
          tierIndex: result.tierIndex,
          hostOverridden: false,
          placedAt: new Date(now).toISOString(),
        };
      }
      if (targetRow && currentItemId) {
        placeTierlistItem(targetRow, currentItemId, nextMatch.placements);
      }

      nextMatch.phase = 'reveal';
      nextMatch.phaseStartedAt = new Date(now).toISOString();
      nextMatch.phaseEndsAt = new Date(now + ((s.revealSec ?? t.revealSec) * 1000)).toISOString();
      break;
    }

    case 'reveal': {
      const hasMore = nextMatch.itemIndex + 1 < nextMatch.totalItems;
      if (hasMore) {
        nextMatch.itemIndex += 1;
        nextMatch.phase = 'countdown';
        nextMatch.currentVote = null;
        nextMatch.phaseStartedAt = new Date(now).toISOString();
        nextMatch.phaseEndsAt = new Date(now + t.countdownMs).toISOString();
      } else {
        nextMatch.phase = 'final';
        nextMatch.currentVote = null;
        nextMatch.phaseStartedAt = new Date(now).toISOString();
        nextMatch.phaseEndsAt = null;
      }
      break;
    }

    default:
      break;
  }

  return nextMatch;
}
