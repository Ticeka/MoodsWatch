const TITLE_ARTWORK_FALLBACK = '/battle-placeholder.svg';

export function normalizeArtworkSource(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (
    normalized.startsWith('http://')
    || normalized.startsWith('https://')
    || normalized.startsWith('//')
    || normalized.startsWith('/')
    || normalized.startsWith('data:')
    || normalized.startsWith('blob:')
  ) {
    return normalized;
  }

  return '';
}

export function getTitleArtwork(title) {
  const artworkCandidates = [
    title?.cover,
    title?.cover_image,
    title?.image_url,
    title?.poster,
    title?.avatar_url,
    title?.voice_actor_image,
    title?.banner,
    title?.banner_image,
    title?.trailer_thumbnail_url,
  ];

  const resolvedArtwork = artworkCandidates
    .map((value) => normalizeArtworkSource(value))
    .find(Boolean);
  if (resolvedArtwork) {
    return resolvedArtwork;
  }

  return TITLE_ARTWORK_FALLBACK;
}

export { TITLE_ARTWORK_FALLBACK };
