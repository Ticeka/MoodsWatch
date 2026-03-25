const TITLE_ARTWORK_FALLBACK = '/battle-placeholder.svg';

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

  const resolvedArtwork = artworkCandidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  if (resolvedArtwork) {
    return resolvedArtwork;
  }

  return TITLE_ARTWORK_FALLBACK;
}

export { TITLE_ARTWORK_FALLBACK };
