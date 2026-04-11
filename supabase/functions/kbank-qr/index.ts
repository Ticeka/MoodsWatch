import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── KBank API config ────────────────────────────────────────────
const CONSUMER_KEY    = Deno.env.get('KBANK_CONSUMER_KEY')!
const CONSUMER_SECRET = Deno.env.get('KBANK_CONSUMER_SECRET')!
const PARTNER_ID      = Deno.env.get('KBANK_PARTNER_ID')!
const PARTNER_SECRET  = Deno.env.get('KBANK_PARTNER_SECRET')!
const IS_SANDBOX      = Deno.env.get('KBANK_SANDBOX') === 'true'

const KBANK_BASE = IS_SANDBOX
  ? 'https://openapi-sandbox.kasikornbank.com'
  : 'https://openapi.kasikornbank.com'

// ── Supabase admin client ───────────────────────────────────────
function makeSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// ── Helpers ─────────────────────────────────────────────────────
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function nowISOBangkok() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace(' ', 'T') + '+07:00'
}

function uniqueRef() {
  return `MW-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

// ── KBank OAuth token ────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch(`${KBANK_BASE}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'QRPayment',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`KBank OAuth failed: ${res.status} — ${text}`)
  }

  const data = await res.json()
  return data.access_token as string
}

// ── Action: create QR ────────────────────────────────────────────
async function handleCreate(body: Record<string, unknown>) {
  const { amount, mode, sessionId, billerId } = body as {
    amount: number | null
    mode: string
    sessionId: string
    billerId: string
  }

  if (!sessionId || !billerId) {
    return jsonResponse({ error: 'Missing sessionId or billerId' }, 400)
  }

  const token = await getAccessToken()
  const partnerTxnUid = uniqueRef()
  const requestDt = nowISOBangkok()

  const payload: Record<string, string> = {
    partnerTxnUid,
    partnerId: PARTNER_ID,
    partnerSecret: PARTNER_SECRET,
    requestDt,
    txnCurrencyCode: 'THB',
    billPaymentRef1: sessionId,
    billPaymentRef2: '',
    billPaymentRef3: '',
    qrType: 'PP',
    billerId,
  }

  // Fixed amount — include txnAmount; open amount — omit it
  if (mode === 'fixed' && amount != null && amount > 0) {
    payload.txnAmount = amount.toFixed(2)
  }

  const res = await fetch(`${KBANK_BASE}/v1/qrpayment/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'env-id': IS_SANDBOX ? 'SANDBOX' : 'PROD',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok || data.statusCode !== '00') {
    console.error('KBank QR request failed', data)
    return jsonResponse({ error: data.statusDesc ?? 'KBank QR generation failed', detail: data }, 502)
  }

  // Persist the KBank reference into the session row
  const supabase = makeSupabase()
  await supabase
    .from('donate_sessions')
    .update({
      reference_id: data.qrReference ?? partnerTxnUid,
      qr_payload: data.qrRawData,
    })
    .eq('id', sessionId)

  return jsonResponse({
    qrRawData: data.qrRawData,
    qrReference: data.qrReference ?? partnerTxnUid,
    partnerTxnUid,
  })
}

// ── Action: inquiry (check payment status) ───────────────────────
async function handleInquiry(body: Record<string, unknown>) {
  const { qrReference, partnerTxnUid, sessionId } = body as {
    qrReference: string
    partnerTxnUid: string
    sessionId: string
  }

  if (!qrReference || !sessionId) {
    return jsonResponse({ error: 'Missing qrReference or sessionId' }, 400)
  }

  const token = await getAccessToken()

  const res = await fetch(`${KBANK_BASE}/v1/qrpayment/v4/inquiry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'env-id': IS_SANDBOX ? 'SANDBOX' : 'PROD',
    },
    body: JSON.stringify({
      partnerId: PARTNER_ID,
      partnerSecret: PARTNER_SECRET,
      requestDt: nowISOBangkok(),
      qrReference,
      partnerTxnUid,
    }),
  })

  const data = await res.json()

  // KBank statusCode '00' = success/paid
  const paid = res.ok && (data.statusCode === '00' || data.txnStatus === 'SUCCESS')

  if (paid) {
    const supabase = makeSupabase()
    await supabase
      .from('donate_sessions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', sessionId)
      .neq('status', 'paid') // idempotent
  }

  return jsonResponse({
    paid,
    statusCode: data.statusCode,
    txnStatus: data.txnStatus,
    detail: data,
  })
}

// ── Action: cancel QR ────────────────────────────────────────────
async function handleCancel(body: Record<string, unknown>) {
  const { qrReference, partnerTxnUid } = body as {
    qrReference: string
    partnerTxnUid: string
  }

  if (!qrReference) {
    return jsonResponse({ error: 'Missing qrReference' }, 400)
  }

  const token = await getAccessToken()

  const res = await fetch(`${KBANK_BASE}/v1/qrpayment/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'env-id': IS_SANDBOX ? 'SANDBOX' : 'PROD',
    },
    body: JSON.stringify({
      partnerId: PARTNER_ID,
      partnerSecret: PARTNER_SECRET,
      requestDt: nowISOBangkok(),
      qrReference,
      partnerTxnUid,
    }),
  })

  const data = await res.json()
  return jsonResponse({ cancelled: res.ok && data.statusCode === '00', detail: data })
}

// ── Router ───────────────────────────────────────────────────────
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = body.action as string

  try {
    if (action === 'create')  return await handleCreate(body)
    if (action === 'inquiry') return await handleInquiry(body)
    if (action === 'cancel')  return await handleCancel(body)
    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('kbank-qr error:', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
