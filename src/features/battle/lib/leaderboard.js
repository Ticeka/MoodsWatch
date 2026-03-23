import { matchesAgeGateMode } from '../../../shared/lib/ageGate.js';

export function normalizeBattleLeaderboardRows(rows = [], showAdult = false) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const title = row?.canonical_titles;

      if (!title?.id) {
        return null;
      }

      return {
        titleId: row.title_id,
        wins: row.wins,
        losses: row.losses,
        totalVotes: row.total_votes,
        winRate: row.win_rate,
        elo: Math.round(row.elo_score),
        title,
      };
    })
    .filter((entry) => entry && matchesAgeGateMode(entry.title, showAdult));
}
