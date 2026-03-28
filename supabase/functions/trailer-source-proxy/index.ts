import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type TrailerCandidate = {
  source: 'tmdb' | 'youtube'
  site: string | null
  videoId: string | null
  url: string | null
  thumbnailUrl: string | null
  matchedTitle: string | null
  query: string | null
}

type TrailerLookupPayload = {
  title?: unknown
  type?: unknown
  subtype?: unknown
  releaseYear?: unknown
  aliases?: unknown
  searchNames?: unknown
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

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeStringList(value: unknown) {
  const list = Array.isArray(value) ? value : []
  const seen = new Set<string>()

  return list
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = normalizeText(entry)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function extractYear(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const directYear = Number(raw)
  if (Number.isFinite(directYear) && directYear >= 1900 && directYear <= 2100) {
    return Math.round(directYear)
  }

  const match = raw.match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : null
}

function scoreTitleMatch(candidateTitle: unknown, queryName: string, releaseYear: number | null, candidateYear: number | null) {
  const candidate = normalizeText(candidateTitle)
  const query = normalizeText(queryName)
  if (!candidate || !query) return 0

  let score = 0

  if (candidate === query) {
    score += 120
  } else if (candidate.startsWith(query) || query.startsWith(candidate)) {
    score += 90
  } else if (candidate.includes(query) || query.includes(candidate)) {
    score += 75
  }

  const candidateTokens = new Set(candidate.split(' '))
  const queryTokens = query.split(' ').filter((token) => token.length > 1)
  let overlap = 0
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1
  }
  score += Math.min(50, overlap * 12)

  if (releaseYear && candidateYear) {
    const diff = Math.abs(releaseYear - candidateYear)
    if (diff === 0) score += 16
    else if (diff === 1) score += 8
    else if (diff >= 4) score -= 10
  }

  return score
}

function buildVideoWatchUrl(site: string | null, videoId: string | null) {
  const normalizedSite = String(site || '').trim().toLowerCase()
  const key = String(videoId || '').trim()
  if (!normalizedSite || !key) return null

  if (normalizedSite === 'youtube') {
    return `https://www.youtube.com/watch?v=${key}`
  }

  if (normalizedSite === 'vimeo') {
    return `https://vimeo.com/${key}`
  }

  if (normalizedSite === 'dailymotion') {
    return `https://www.dailymotion.com/video/${key}`
  }

  return null
}

function buildYouTubeThumbnail(videoId: string | null) {
  const key = String(videoId || '').trim()
  return key ? `https://i.ytimg.com/vi/${key}/hqdefault.jpg` : null
}

function normalizeTmdbAuthValue(value: string | undefined) {
  return String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
}

async function fetchTmdbJson(path: string, authValue: string, params: Record<string, string | number | undefined> = {}) {
  const baseUrl = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    baseUrl.searchParams.set(key, String(value))
  }

  const bearerResponse = await fetch(baseUrl, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${authValue}`,
    },
  })

  if (bearerResponse.ok) {
    return await bearerResponse.json()
  }

  if (bearerResponse.status !== 401 && bearerResponse.status !== 403) {
    throw new Error(`TMDb ${bearerResponse.status}`)
  }

  const keyUrl = new URL(baseUrl)
  keyUrl.searchParams.set('api_key', authValue)

  const keyResponse = await fetch(keyUrl, {
    headers: { accept: 'application/json' },
  })

  if (!keyResponse.ok) {
    throw new Error(`TMDb ${keyResponse.status}`)
  }

  return await keyResponse.json()
}

function pickTmdbVideo(videos: Array<Record<string, unknown>>) {
  return [...videos].sort((left, right) => {
    const leftSite = String(left.site || '').toLowerCase()
    const rightSite = String(right.site || '').toLowerCase()
    const sitePriority = { youtube: 4, vimeo: 2, dailymotion: 1 }
    const leftSiteScore = sitePriority[leftSite as keyof typeof sitePriority] || 0
    const rightSiteScore = sitePriority[rightSite as keyof typeof sitePriority] || 0
    if (leftSiteScore !== rightSiteScore) return rightSiteScore - leftSiteScore

    const leftType = String(left.type || '').toLowerCase()
    const rightType = String(right.type || '').toLowerCase()
    const typePriority = { trailer: 4, teaser: 3, clip: 2 }
    const leftTypeScore = typePriority[leftType as keyof typeof typePriority] || 0
    const rightTypeScore = typePriority[rightType as keyof typeof typePriority] || 0
    if (leftTypeScore !== rightTypeScore) return rightTypeScore - leftTypeScore

    if (Boolean(left.official) !== Boolean(right.official)) {
      return Number(Boolean(right.official)) - Number(Boolean(left.official))
    }

    return 0
  })[0] || null
}

async function resolveTmdbTrailer(searchNames: string[], type: string, releaseYear: number | null, tmdbAuthValue: string) {
  if (type !== 'anime') return null

  for (const searchName of searchNames.slice(0, 3)) {
    for (const kind of ['tv', 'movie'] as const) {
      const searchPayload = await fetchTmdbJson(`/search/${kind}`, tmdbAuthValue, {
        query: searchName,
        include_adult: 'false',
      })

      const results = Array.isArray(searchPayload?.results) ? searchPayload.results : []
      const bestMatch = [...results]
        .map((result) => {
          const candidateTitle = kind === 'tv' ? result.name : result.title
          const candidateYear = extractYear(kind === 'tv' ? result.first_air_date : result.release_date)
          return {
            result,
            score: scoreTitleMatch(candidateTitle, searchName, releaseYear, candidateYear),
          }
        })
        .sort((left, right) => right.score - left.score)[0]

      if (!bestMatch || bestMatch.score < 40) {
        continue
      }

      const videosPayload = await fetchTmdbJson(`/${kind}/${bestMatch.result.id}/videos`, tmdbAuthValue)
      const videos = Array.isArray(videosPayload?.results) ? videosPayload.results : []
      const selectedVideo = pickTmdbVideo(videos)
      if (!selectedVideo) {
        continue
      }

      const site = String(selectedVideo.site || '').trim().toLowerCase() || null
      const videoId = String(selectedVideo.key || '').trim() || null
      if (!site || !videoId) {
        continue
      }

      return {
        source: 'tmdb',
        site,
        videoId,
        url: buildVideoWatchUrl(site, videoId),
        thumbnailUrl: site === 'youtube' ? buildYouTubeThumbnail(videoId) : null,
        matchedTitle: String((kind === 'tv' ? bestMatch.result.name : bestMatch.result.title) || '') || null,
        query: searchName,
      } satisfies TrailerCandidate
    }
  }

  return null
}

function buildYouTubeQueries(searchNames: string[], type: string, subtype: string) {
  const queries: string[] = []
  const suffixes = type === 'anime'
    ? ['official trailer anime', 'anime trailer', 'pv']
    : subtype === 'webtoon'
      ? ['official trailer webtoon', 'webtoon trailer', 'official trailer']
      : ['official trailer', 'trailer']

  for (const searchName of searchNames.slice(0, 2)) {
    for (const suffix of suffixes) {
      const query = `${searchName} ${suffix}`.trim()
      if (!queries.includes(query)) {
        queries.push(query)
      }
    }
  }

  return queries.slice(0, 4)
}

function pickYouTubeResult(items: Array<Record<string, unknown>>, searchName: string) {
  return [...items]
    .map((item) => {
      const snippet = typeof item.snippet === 'object' && item.snippet ? item.snippet as Record<string, unknown> : {}
      const title = String(snippet.title || '')
      let score = scoreTitleMatch(title, searchName, null, null)

      const normalizedTitle = normalizeText(title)
      if (normalizedTitle.includes('official')) score += 18
      if (normalizedTitle.includes('trailer')) score += 22
      if (normalizedTitle.includes('teaser')) score += 8
      if (normalizedTitle.includes('pv')) score += 10

      for (const penalty of ['reaction', 'review', 'edit', 'amv', 'fanmade', 'ost', 'opening', 'ending']) {
        if (normalizedTitle.includes(penalty)) score -= 20
      }

      return { item, score }
    })
    .sort((left, right) => right.score - left.score)[0]
}

async function resolveYouTubeTrailer(searchNames: string[], type: string, subtype: string, youtubeApiKey: string) {
  const queries = buildYouTubeQueries(searchNames, type, subtype)

  for (const query of queries) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', '5')
    url.searchParams.set('q', query)
    url.searchParams.set('videoEmbeddable', 'true')
    url.searchParams.set('videoSyndicated', 'true')
    url.searchParams.set('key', youtubeApiKey)

    const response = await fetch(url, {
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`YouTube ${response.status}`)
    }

    const payload = await response.json()
    const items = Array.isArray(payload?.items) ? payload.items : []
    const best = pickYouTubeResult(items, query)
    if (!best || best.score < 45) {
      continue
    }

    const item = best.item
    const snippet = typeof item.snippet === 'object' && item.snippet ? item.snippet as Record<string, unknown> : {}
    const id = typeof item.id === 'object' && item.id ? item.id as Record<string, unknown> : {}
    const videoId = String(id.videoId || '').trim() || null
    if (!videoId) {
      continue
    }

    const thumbnails = typeof snippet.thumbnails === 'object' && snippet.thumbnails ? snippet.thumbnails as Record<string, Record<string, unknown>> : {}
    const thumbnailUrl = String(
      thumbnails.maxres?.url
      || thumbnails.high?.url
      || thumbnails.medium?.url
      || thumbnails.default?.url
      || ''
    ).trim() || buildYouTubeThumbnail(videoId)

    return {
      source: 'youtube',
      site: 'youtube',
      videoId,
      url: buildVideoWatchUrl('youtube', videoId),
      thumbnailUrl,
      matchedTitle: String(snippet.title || '') || null,
      query,
    } satisfies TrailerCandidate
  }

  return null
}

async function requireAdminOrEditor(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment for trailer source proxy')
  }

  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { ok: false, status: 401, message: 'Missing auth token' } as const
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData.user) {
    return { ok: false, status: 401, message: 'Invalid auth token' } as const
  }

  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  if (!profile || !['admin', 'editor'].includes(String(profile.role || ''))) {
    return { ok: false, status: 403, message: 'Admin or editor role required' } as const
  }

  return { ok: true } as const
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const accessCheck = await requireAdminOrEditor(request)
    if (!accessCheck.ok) {
      return jsonResponse({ error: accessCheck.message }, accessCheck.status)
    }

    let body: TrailerLookupPayload = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const searchNames = normalizeStringList(body.searchNames)
    const aliases = normalizeStringList(body.aliases)
    const fallbackNames = normalizeStringList([body.title, ...aliases])
    const lookupNames = (searchNames.length ? searchNames : fallbackNames).slice(0, 5)

    if (!lookupNames.length) {
      return jsonResponse({ trailer: null, reason: 'missing-title' }, 200)
    }

    const type = String(body.type || '').trim().toLowerCase()
    const subtype = String(body.subtype || '').trim().toLowerCase()
    const releaseYear = extractYear(body.releaseYear)

    const tmdbAuthValue = normalizeTmdbAuthValue(
      Deno.env.get('TMDB_API_KEY')
      || Deno.env.get('TMDB_BEARER_TOKEN')
      || Deno.env.get('TMDB_READ_ACCESS_TOKEN')
    )
    const youtubeApiKey = String(Deno.env.get('YOUTUBE_API_KEY') || '').trim()

    let trailer: TrailerCandidate | null = null
    const sourcesTried: string[] = []

    if (tmdbAuthValue) {
      sourcesTried.push('tmdb')
      try {
        trailer = await resolveTmdbTrailer(lookupNames, type, releaseYear, tmdbAuthValue)
      } catch (error) {
        console.warn('[trailer-source-proxy] TMDb lookup failed:', error)
      }
    }

    if (!trailer && youtubeApiKey) {
      sourcesTried.push('youtube')
      try {
        trailer = await resolveYouTubeTrailer(lookupNames, type, subtype, youtubeApiKey)
      } catch (error) {
        console.warn('[trailer-source-proxy] YouTube lookup failed:', error)
      }
    }

    return jsonResponse({
      trailer,
      sourcesTried,
      searchNames: lookupNames,
    })
  } catch (error) {
    console.error('[trailer-source-proxy] unexpected error:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
