import { createClient } from 'npm:@supabase/supabase-js@2'

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type PlaybackStatus = 'ready' | 'limited' | 'blocked' | 'unknown'

type YoutubeVideoResult = {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  durationSec: number | null
  playbackStatus: PlaybackStatus
  availabilityReason: string | null
  embedUrl: string
  watchUrl: string
}

type YoutubePlaylistItem = YoutubeVideoResult & {
  playlistId: string
  importSourcePosition: number
}

type YoutubePlaylistResult = {
  playlistId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  totalItems: number
  items: YoutubePlaylistItem[]
  nextPageToken: string | null
  fetchedCount: number
}

type ResolvePayload = {
  url?: unknown
  pageToken?: unknown
  maxItems?: unknown
}

// ──────────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

// ──────────────────────────────────────────────────────────────────
// Auth — any authenticated user may call this
// ──────────────────────────────────────────────────────────────────

async function requireAuthenticatedUser(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment')
  }

  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { ok: false, status: 401, message: 'Missing auth token' } as const
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await adminClient.auth.getUser(token)
  if (error || !data.user) {
    return { ok: false, status: 401, message: 'Invalid auth token' } as const
  }

  return { ok: true, userId: data.user.id } as const
}

// ──────────────────────────────────────────────────────────────────
// URL parsing
// ──────────────────────────────────────────────────────────────────

function parseYoutubeVideoId(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0] || null
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url
  }
  return null
}

function parseYoutubePlaylistId(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  try {
    const u = new URL(url)
    const listId = u.searchParams.get('list')
    return listId || null
  } catch {
    if (/^[a-zA-Z0-9_-]{12,64}$/.test(url)) return url
  }
  return null
}

type ParsedYoutubeUrl =
  | { type: 'video'; id: string }
  | { type: 'playlist'; id: string }
  | { type: 'invalid'; id: null }

function parseYoutubeUrl(raw: unknown): ParsedYoutubeUrl {
  const url = String(raw || '').trim()
  if (!url) return { type: 'invalid', id: null }

  // Playlist takes priority for watch URLs that also carry &list=
  const playlistId = parseYoutubePlaylistId(url)
  if (playlistId) return { type: 'playlist', id: playlistId }

  const videoId = parseYoutubeVideoId(url)
  if (videoId) return { type: 'video', id: videoId }

  return { type: 'invalid', id: null }
}

// ──────────────────────────────────────────────────────────────────
// YouTube API helpers
// ──────────────────────────────────────────────────────────────────

async function ytFetch(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://www.googleapis.com/youtube/v3${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  }
  url.searchParams.set('key', apiKey)

  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

/** Parse ISO 8601 duration (PT1H2M3S) → seconds */
function parseDuration(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0)
}

function buildThumbnailUrl(thumbnails: Record<string, { url?: string }> | null, videoId: string): string {
  if (thumbnails) {
    const best = thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url
    if (best) return String(best)
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

function resolvePlaybackStatus(
  privacyStatus: string | null,
  embeddable: boolean | null,
): { status: PlaybackStatus; reason: string | null } {
  if (privacyStatus === 'private') return { status: 'blocked', reason: 'private' }
  if (privacyStatus === 'unlisted') return { status: 'limited', reason: 'unlisted' }
  if (embeddable === false) return { status: 'limited', reason: 'embed_disabled' }
  if (privacyStatus === 'public' && embeddable !== false) return { status: 'ready', reason: null }
  return { status: 'unknown', reason: null }
}

// ──────────────────────────────────────────────────────────────────
// Resolve single video
// ──────────────────────────────────────────────────────────────────

async function resolveVideo(videoId: string, apiKey: string): Promise<YoutubeVideoResult | null> {
  const data = await ytFetch('/videos', {
    part: 'snippet,contentDetails,status',
    id: videoId,
    maxResults: '1',
  }, apiKey)

  const item = Array.isArray(data?.items) ? data.items[0] : null
  if (!item) return null

  const snippet = (item.snippet || {}) as Record<string, unknown>
  const contentDetails = (item.contentDetails || {}) as Record<string, unknown>
  const status = (item.status || {}) as Record<string, unknown>
  const thumbnails = (snippet.thumbnails || null) as Record<string, { url?: string }> | null

  const { status: playbackStatus, reason: availabilityReason } = resolvePlaybackStatus(
    String(status.privacyStatus || '').toLowerCase() || null,
    status.embeddable !== undefined ? Boolean(status.embeddable) : null,
  )

  return {
    videoId,
    title: String(snippet.title || ''),
    channelTitle: String(snippet.channelTitle || ''),
    thumbnailUrl: buildThumbnailUrl(thumbnails, videoId),
    durationSec: parseDuration(String(contentDetails.duration || '')),
    playbackStatus,
    availabilityReason,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }
}

// ──────────────────────────────────────────────────────────────────
// Resolve playlist (snapshot import with pagination)
// ──────────────────────────────────────────────────────────────────

/** Fetch video details for up to 50 IDs in one call */
async function batchFetchVideoDetails(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, { durationSec: number | null; playbackStatus: PlaybackStatus; availabilityReason: string | null }>> {
  const result = new Map()
  if (!videoIds.length) return result

  const data = await ytFetch('/videos', {
    part: 'contentDetails,status',
    id: videoIds.join(','),
    maxResults: '50',
  }, apiKey)

  const items = Array.isArray(data?.items) ? data.items : []
  for (const item of items) {
    const id = String(item.id || '')
    if (!id) continue
    const contentDetails = (item.contentDetails || {}) as Record<string, unknown>
    const status = (item.status || {}) as Record<string, unknown>
    const { status: playbackStatus, reason: availabilityReason } = resolvePlaybackStatus(
      String(status.privacyStatus || '').toLowerCase() || null,
      status.embeddable !== undefined ? Boolean(status.embeddable) : null,
    )
    result.set(id, {
      durationSec: parseDuration(String(contentDetails.duration || '')),
      playbackStatus,
      availabilityReason,
    })
  }
  return result
}

async function resolvePlaylist(
  playlistId: string,
  apiKey: string,
  maxItems: number,
  pageToken: string | null,
): Promise<YoutubePlaylistResult> {
  // 1. Playlist metadata
  const playlistData = await ytFetch('/playlists', {
    part: 'snippet,contentDetails',
    id: playlistId,
    maxResults: '1',
  }, apiKey)

  const playlistItem = Array.isArray(playlistData?.items) ? playlistData.items[0] : null
  const playlistSnippet = (playlistItem?.snippet || {}) as Record<string, unknown>
  const playlistContentDetails = (playlistItem?.contentDetails || {}) as Record<string, unknown>
  const playlistThumbnails = (playlistSnippet.thumbnails || null) as Record<string, { url?: string }> | null

  const totalItems = Number(playlistContentDetails.itemCount || 0)

  // 2. Fetch playlist items (paginating up to maxItems)
  const allPlaylistItems: Array<{ videoId: string; title: string; channelTitle: string; thumbnailUrl: string; position: number }> = []
  let nextToken: string | null = pageToken
  const batchSize = 50 // YouTube max per page

  do {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: String(Math.min(batchSize, maxItems - allPlaylistItems.length)),
    }
    if (nextToken) params.pageToken = nextToken

    const pageData = await ytFetch('/playlistItems', params, apiKey)
    const pageItems = Array.isArray(pageData?.items) ? pageData.items : []

    for (const item of pageItems) {
      const snippet = (item.snippet || {}) as Record<string, unknown>
      const resourceId = (snippet.resourceId || {}) as Record<string, unknown>
      const videoId = String(resourceId.videoId || '')
      if (!videoId) continue

      const thumbs = (snippet.thumbnails || null) as Record<string, { url?: string }> | null
      allPlaylistItems.push({
        videoId,
        title: String(snippet.title || ''),
        channelTitle: String(snippet.videoOwnerChannelTitle || snippet.channelTitle || ''),
        thumbnailUrl: buildThumbnailUrl(thumbs, videoId),
        position: Number(snippet.position || allPlaylistItems.length),
      })
    }

    nextToken = String(pageData?.nextPageToken || '') || null
  } while (nextToken && allPlaylistItems.length < maxItems)

  // 3. Batch-fetch video details (embeddable, duration) in chunks of 50
  const detailMap = new Map<string, { durationSec: number | null; playbackStatus: PlaybackStatus; availabilityReason: string | null }>()
  const ids = allPlaylistItems.map((i) => i.videoId)
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50)
    const chunkMap = await batchFetchVideoDetails(chunk, apiKey)
    chunkMap.forEach((v, k) => detailMap.set(k, v))
  }

  // 4. Compose final items
  const items: YoutubePlaylistItem[] = allPlaylistItems.map((pi) => {
    const details = detailMap.get(pi.videoId)
    return {
      videoId: pi.videoId,
      title: pi.title,
      channelTitle: pi.channelTitle,
      thumbnailUrl: pi.thumbnailUrl,
      durationSec: details?.durationSec ?? null,
      playbackStatus: details?.playbackStatus ?? 'unknown',
      availabilityReason: details?.availabilityReason ?? null,
      embedUrl: `https://www.youtube.com/embed/${pi.videoId}`,
      watchUrl: `https://www.youtube.com/watch?v=${pi.videoId}`,
      playlistId,
      importSourcePosition: pi.position,
    }
  })

  // First non-blockeditem thumbnail for playlist cover
  const coverThumbnail = items.find((i) => i.playbackStatus !== 'blocked')?.thumbnailUrl
    ?? (playlistThumbnails ? buildThumbnailUrl(playlistThumbnails, '') : null)

  return {
    playlistId,
    title: String(playlistSnippet.title || ''),
    channelTitle: String(playlistSnippet.channelTitle || ''),
    thumbnailUrl: coverThumbnail,
    totalItems,
    items,
    nextPageToken: nextToken,
    fetchedCount: items.length,
  }
}

// ──────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) {
      return jsonResponse({ error: auth.message }, auth.status)
    }

    const apiKey = String(Deno.env.get('YOUTUBE_API_KEY') || '').trim()
    if (!apiKey) {
      return jsonResponse({ error: 'YouTube API is not configured on this server.' }, 503)
    }

    let body: ResolvePayload = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const rawUrl = String(body.url || '').trim()
    if (!rawUrl) {
      return jsonResponse({ error: 'url is required', code: 'missing_url' }, 400)
    }

    const parsed = parseYoutubeUrl(rawUrl)
    if (parsed.type === 'invalid') {
      return jsonResponse({ error: 'Not a valid YouTube video or playlist URL.', code: 'invalid_url' }, 400)
    }

    if (parsed.type === 'video') {
      const video = await resolveVideo(parsed.id, apiKey)
      if (!video) {
        return jsonResponse({ error: 'Video not found or is unavailable.', code: 'not_found' }, 404)
      }
      return jsonResponse({ type: 'video', video })
    }

    // playlist
    const maxItems = Math.min(Math.max(1, Number(body.maxItems || 100)), 200)
    const pageToken = body.pageToken ? String(body.pageToken) : null
    const playlist = await resolvePlaylist(parsed.id, apiKey, maxItems, pageToken)

    return jsonResponse({ type: 'playlist', playlist })
  } catch (error) {
    console.error('[party-youtube-resolve] unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'

    // Surface YouTube quota errors with a distinct code
    if (message.includes('403') || message.includes('quotaExceeded')) {
      return jsonResponse({ error: 'YouTube API quota exceeded. Try again later.', code: 'quota_exceeded' }, 429)
    }

    return jsonResponse({ error: message }, 500)
  }
})
