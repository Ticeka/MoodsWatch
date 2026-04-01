const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AniListPayload = {
  query?: unknown
  variables?: unknown
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await request.json() as AniListPayload
    const query = String(body?.query || '').trim()
    const variables = body?.variables && typeof body.variables === 'object' ? body.variables : {}

    if (!query) {
      return jsonResponse({ error: 'Missing query' }, 400)
    }

    const upstreamResponse = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })

    const responseText = await upstreamResponse.text()
    let responsePayload: unknown = null

    try {
      responsePayload = responseText ? JSON.parse(responseText) : null
    } catch {
      responsePayload = { error: responseText || 'Invalid AniList response' }
    }

    return jsonResponse(responsePayload, upstreamResponse.status)
  } catch (error) {
    console.error('[anilist-proxy] unexpected error:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
