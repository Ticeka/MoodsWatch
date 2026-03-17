const TITLE_ARTWORK_FALLBACK = '/battle-placeholder.svg';

export function getTitleArtwork(title) {
  if (title?.cover) {
    return title.cover;
  }

  if (title?.banner) {
    return title.banner;
  }

  return TITLE_ARTWORK_FALLBACK;
}

export { TITLE_ARTWORK_FALLBACK };
