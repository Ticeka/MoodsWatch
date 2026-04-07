export function formatCompactDate(value, locale) {
  if (!value) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export function getDisplayTitle(title) {
  return title?.title_en || title?.title_th || title?.title_romaji || title?.title_native || title?.slug || '';
}
