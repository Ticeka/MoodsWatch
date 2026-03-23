export function matchesAgeGateMode(title, showAdult = false) {
  const isAdult = Boolean(title?.is_adult);
  return showAdult ? isAdult : !isAdult;
}

export function filterTitlesForAgeGate(titles = [], showAdult = false) {
  return (Array.isArray(titles) ? titles : []).filter((title) => matchesAgeGateMode(title, showAdult));
}

function resolveDeckTitles(deck, titleLookup) {
  if (Array.isArray(deck?.titles) && deck.titles.length > 0) {
    return deck.titles;
  }

  if (!Array.isArray(deck?.titleIds) || !titleLookup?.get) {
    return [];
  }

  return deck.titleIds
    .map((titleId) => titleLookup.get(Number(titleId)) || null)
    .filter(Boolean);
}

export function matchesDeckAgeGateMode(deck, showAdult = false, titleLookup = null) {
  const deckTitles = resolveDeckTitles(deck, titleLookup);
  if (deckTitles.length === 0) {
    return false;
  }

  const hasAdultTitle = deckTitles.some((title) => Boolean(title?.is_adult));
  return showAdult ? hasAdultTitle : !hasAdultTitle;
}

export function filterDecksForAgeGate(decks = [], showAdult = false, titleLookup = null) {
  return (Array.isArray(decks) ? decks : []).filter((deck) => matchesDeckAgeGateMode(deck, showAdult, titleLookup));
}
