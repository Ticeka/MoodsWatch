function normalizeTrailerSite(site) {
  const normalized = String(site || '').trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === 'youtu' || normalized === 'youtube') return 'youtube';
  if (normalized === 'dailymotion') return 'dailymotion';
  return normalized;
}

function parseYouTubeVideoId(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const directMatch = raw.match(/^[A-Za-z0-9_-]{6,}$/);
  if (directMatch) {
    return raw;
  }

  try {
    const url = new URL(raw);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace(/^\/+/, '').split('/')[0] || null;
    }

    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }

      const embedMatch = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseDailymotionVideoId(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const directMatch = raw.match(/^[A-Za-z0-9]+$/);
  if (directMatch) {
    return raw;
  }

  try {
    const url = new URL(raw);
    if (url.hostname.includes('dailymotion.com')) {
      const match = url.pathname.match(/^\/video\/([^_/?#]+)/);
      return match?.[1] || null;
    }

    if (url.hostname.includes('dai.ly')) {
      return url.pathname.replace(/^\/+/, '').split('/')[0] || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildTrailerUrl({ site, id, videoId } = {}) {
  const normalizedSite = normalizeTrailerSite(site);
  const resolvedVideoId = String(videoId || id || '').trim();
  if (!normalizedSite || !resolvedVideoId) return null;

  if (normalizedSite === 'youtube') {
    return `https://www.youtube.com/watch?v=${resolvedVideoId}`;
  }

  if (normalizedSite === 'dailymotion') {
    return `https://www.dailymotion.com/video/${resolvedVideoId}`;
  }

  return null;
}

export function buildTrailerThumbnailUrl({ site, id, videoId, thumbnailUrl } = {}) {
  if (thumbnailUrl) {
    return thumbnailUrl;
  }

  const normalizedSite = normalizeTrailerSite(site);
  const resolvedVideoId = String(videoId || id || '').trim();
  if (!normalizedSite || !resolvedVideoId) return null;

  if (normalizedSite === 'youtube') {
    return `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`;
  }

  return null;
}

export function parseTrailerUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return { site: null, videoId: null };

  const youtubeVideoId = parseYouTubeVideoId(raw);
  if (youtubeVideoId) {
    return { site: 'youtube', videoId: youtubeVideoId };
  }

  const dailymotionVideoId = parseDailymotionVideoId(raw);
  if (dailymotionVideoId) {
    return { site: 'dailymotion', videoId: dailymotionVideoId };
  }

  return { site: null, videoId: null };
}

export function getTrailerEmbed({ site, videoId, id, url } = {}) {
  const normalizedSite = normalizeTrailerSite(site);
  const resolvedVideoId = String(videoId || id || '').trim();

  if (normalizedSite === 'youtube' && resolvedVideoId) {
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${resolvedVideoId}?rel=0`,
      watchUrl: buildTrailerUrl({ site: normalizedSite, videoId: resolvedVideoId }),
    };
  }

  if (normalizedSite === 'dailymotion' && resolvedVideoId) {
    return {
      provider: 'dailymotion',
      embedUrl: `https://www.dailymotion.com/embed/video/${resolvedVideoId}`,
      watchUrl: buildTrailerUrl({ site: normalizedSite, videoId: resolvedVideoId }),
    };
  }

  if (url) {
    return {
      provider: normalizedSite || 'external',
      embedUrl: null,
      watchUrl: url,
    };
  }

  return null;
}

export function normalizeTrailer(value = {}) {
  const nestedTrailer = value?.trailer && typeof value.trailer === 'object'
    ? value.trailer
    : null;
  const raw = nestedTrailer
    ? { ...value, ...nestedTrailer }
    : value;
  const parsedFromUrl = parseTrailerUrl(raw.trailer_url || raw.url || '');
  const site = normalizeTrailerSite(raw.trailer_site || raw.site || parsedFromUrl.site);
  const fallbackObjectId = nestedTrailer?.id
    || (
      raw.id
      && !nestedTrailer
      && (raw.site || raw.thumbnail || raw.thumbnailUrl || raw.url)
        ? raw.id
        : null
    );
  const videoId = String(raw.trailer_video_id || raw.videoId || fallbackObjectId || parsedFromUrl.videoId || '').trim() || null;
  const trailerUrl = raw.trailer_url || raw.url || buildTrailerUrl({ site, videoId });
  const thumbnailUrl = buildTrailerThumbnailUrl({
    site,
    videoId,
    thumbnailUrl: raw.trailer_thumbnail_url || raw.thumbnail || raw.thumbnailUrl || null,
  });
  const embed = getTrailerEmbed({ site, videoId, url: trailerUrl });

  if (!trailerUrl && !videoId) {
    return null;
  }

  return {
    url: trailerUrl,
    site,
    videoId,
    thumbnailUrl,
    source: raw.trailer_source || raw.source || null,
    embedUrl: embed?.embedUrl || null,
    watchUrl: embed?.watchUrl || trailerUrl,
    provider: embed?.provider || site || 'external',
  };
}
