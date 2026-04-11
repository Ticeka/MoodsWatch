import { supabase } from '@/shared/lib/supabase';
import { normalizeDonateConfig, saveDonateConfigLocal } from '@/shared/config/donate';

const DONATE_CONFIG_ID = '00000000-0000-0000-0000-000000000099';

export async function fetchDonateConfig() {
  const { data, error } = await supabase
    .from('donate_config')
    .select('*')
    .eq('id', DONATE_CONFIG_ID)
    .single();

  if (error) throw error;

  const config = normalizeDonateConfig({
    enabled: data.enabled,
    receiverType: data.receiver_type,
    receiverValue: data.receiver_value,
    receiverName: data.receiver_name,
    minAmount: data.min_amount,
    maxAmount: data.max_amount,
    presetAmounts: data.preset_amounts,
    allowOpenAmount: data.allow_open_amount,
    campaignNameTh: data.campaign_name_th,
    campaignNameEn: data.campaign_name_en,
    thankYouTh: data.thank_you_th,
    thankYouEn: data.thank_you_en,
  });

  // Sync to localStorage for offline/fast access
  saveDonateConfigLocal(config);
  return config;
}

export async function updateDonateConfig(config) {
  const { error } = await supabase
    .from('donate_config')
    .update({
      enabled: config.enabled,
      receiver_type: config.receiverType,
      receiver_value: config.receiverValue,
      receiver_name: config.receiverName,
      min_amount: config.minAmount,
      max_amount: config.maxAmount,
      preset_amounts: config.presetAmounts,
      allow_open_amount: config.allowOpenAmount,
      campaign_name_th: config.campaignNameTh,
      campaign_name_en: config.campaignNameEn,
      thank_you_th: config.thankYouTh,
      thank_you_en: config.thankYouEn,
    })
    .eq('id', DONATE_CONFIG_ID);

  if (error) throw error;

  saveDonateConfigLocal(config);
  return config;
}

export async function createDonateSession({ amount, mode, sourcePage, donorName }) {
  const { data, error } = await supabase
    .from('donate_sessions')
    .insert({
      amount: mode === 'open' ? null : amount,
      mode,
      donor_name: donorName || null,
      source_page: sourcePage || window.location.pathname,
      status: 'qr_generated',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select('id, status, expires_at')
    .single();

  if (error) throw error;
  return data;
}

export async function requestKBankQR({ sessionId, amount, mode, billerId }) {
  const { data, error } = await supabase.functions.invoke('kbank-qr', {
    body: { action: 'create', sessionId, amount, mode, billerId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { qrRawData, qrReference, partnerTxnUid }
}

export async function inquireKBankQR({ sessionId, qrReference, partnerTxnUid }) {
  const { data, error } = await supabase.functions.invoke('kbank-qr', {
    body: { action: 'inquiry', sessionId, qrReference, partnerTxnUid },
  });
  if (error) throw error;
  return data; // { paid, statusCode, txnStatus }
}

export async function cancelKBankQR({ qrReference, partnerTxnUid }) {
  const { data, error } = await supabase.functions.invoke('kbank-qr', {
    body: { action: 'cancel', qrReference, partnerTxnUid },
  });
  if (error) throw error;
  return data;
}

export async function getDonateSession(id) {
  const { data, error } = await supabase
    .from('donate_sessions')
    .select('id, amount, mode, status, expires_at, paid_at, created_at')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function markDonateSessionPaid(id) {
  const { error } = await supabase
    .from('donate_sessions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function fetchDonateSessionsAdmin({ page = 1, pageSize = 30, statusFilter = 'all' } = {}) {
  let query = supabase
    .from('donate_sessions')
    .select('id, amount, mode, status, donor_name, source_page, expires_at, paid_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return { sessions: data || [], total: count || 0 };
}
