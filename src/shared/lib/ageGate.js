export function matchesAgeGateMode(title, showAdult = false) {
  const isAdult = Boolean(title?.is_adult);
  return showAdult ? isAdult : !isAdult;
}

export function filterTitlesForAgeGate(titles = [], showAdult = false) {
  return (Array.isArray(titles) ? titles : []).filter((title) => matchesAgeGateMode(title, showAdult));
}
