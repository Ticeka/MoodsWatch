function normalizeText(value) {
  return String(value || '').trim();
}

export function buildTitleRouteSlug(slug = '', id = null) {
  const normalizedSlug = normalizeText(slug);
  const numericId = Number(id || 0);

  if (!normalizedSlug) {
    return '';
  }

  // Stored title slugs in the catalog may already include their canonical
  // numeric suffix, e.g. "hunter-x-hunter-2011-11061". In that case, do not
  // append any extra id from battle/tierlist entity payloads.
  if (/-\d+$/.test(normalizedSlug)) {
    return normalizedSlug;
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return normalizedSlug;
  }

  return normalizedSlug.endsWith(`-${numericId}`)
    ? normalizedSlug
    : `${normalizedSlug}-${numericId}`;
}

export function buildTitlePersonRouteId(person = {}, fallbackIndex = 0) {
  const anilistId = Number(person?.anilist_id || 0);
  if (Number.isFinite(anilistId) && anilistId > 0) {
    return String(anilistId);
  }

  const name = normalizeText(person?.name_full)
    || normalizeText(person?.title_en)
    || normalizeText(person?.title_th)
    || normalizeText(person?.name_native)
    || normalizeText(person?.title_native);
  if (name) {
    return encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));
  }

  return `entry-${fallbackIndex}`;
}

export function matchesTitlePersonRouteId(person = {}, routeId = '', fallbackIndex = 0) {
  return buildTitlePersonRouteId(person, fallbackIndex) === String(routeId || '').trim();
}
