export const TITLE_SORT_OPTIONS = [
  { id: 'match', labelKey: 'sorting.match' },
  { id: 'popularity', labelKey: 'sorting.popularity' },
  { id: 'score', labelKey: 'sorting.score' },
  { id: 'year', labelKey: 'sorting.newest' },
  { id: 'title', labelKey: 'sorting.title' },
];

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

export function sortTitlesCollection(titles, sortBy = 'match') {
  const items = [...(titles || [])];

  if (sortBy === 'match') {
    return items;
  }

  return items.sort((a, b) => {
    if (sortBy === 'score') {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
    }

    if (sortBy === 'popularity') {
      const popularityDiff = Number(b.popularity || 0) - Number(a.popularity || 0);
      if (popularityDiff !== 0) return popularityDiff;
    }

    if (sortBy === 'year') {
      const yearDiff = Number(b.year || 0) - Number(a.year || 0);
      if (yearDiff !== 0) return yearDiff;
    }

    if (sortBy === 'title') {
      return compareText(a.title_th || a.title_en, b.title_th || b.title_en);
    }

    const fallbackScoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (fallbackScoreDiff !== 0) return fallbackScoreDiff;

    const fallbackPopularityDiff = Number(b.popularity || 0) - Number(a.popularity || 0);
    if (fallbackPopularityDiff !== 0) return fallbackPopularityDiff;

    return compareText(a.title_th || a.title_en, b.title_th || b.title_en);
  });
}
