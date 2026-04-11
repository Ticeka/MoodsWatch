import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, QrCode, RotateCcw, Save } from 'lucide-react';
import { DEFAULT_DONATE_CONFIG, normalizeDonateConfig } from '@/shared/config/donate';
import { useDonateConfig } from '@/shared/hooks/useDonateConfig';
import { fetchDonateSessionsAdmin, markDonateSessionPaid, updateDonateConfig } from '../api/adminDonateApi';

const STATUS_LABELS = {
  qr_generated: { label: 'QR Generated', color: '#6b7280' },
  pending_payment: { label: 'Pending', color: '#f59e0b' },
  paid: { label: 'Paid', color: '#22c55e' },
  expired: { label: 'Expired', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#9ca3af' },
};

function mapConfigToForm(config) {
  return {
    ...config,
    presetAmountsRaw: config.presetAmounts.join(', '),
  };
}

export function AdminDonate() {
  const liveConfig = useDonateConfig();
  const [form, setForm] = useState(() => mapConfigToForm(liveConfig));
  const [isSaving, setIsSaving] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('paid');
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    setForm(mapConfigToForm(liveConfig));
  }, [liveConfig]);

  useEffect(() => {
    setLoadingSessions(true);
    fetchDonateSessionsAdmin({ page: sessionsPage, statusFilter })
      .then(({ sessions: s, total }) => { setSessions(s); setSessionsTotal(total); })
      .catch(() => toast.error('Failed to load sessions'))
      .finally(() => setLoadingSessions(false));
  }, [sessionsPage, statusFilter]);

  const updateField = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    const presetAmounts = form.presetAmountsRaw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => v > 0);

    const config = normalizeDonateConfig({ ...form, presetAmounts });
    setIsSaving(true);
    try {
      await updateDonateConfig(config);
      toast.success('Saved donate settings');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setForm(mapConfigToForm(DEFAULT_DONATE_CONFIG));
    toast.success('Reset to defaults (not saved yet)');
  };

  const handleMarkPaid = async (sessionId) => {
    try {
      await markDonateSessionPaid(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'paid', paid_at: new Date().toISOString() } : s))
      );
      toast.success('Marked as paid');
    } catch {
      toast.error('Failed to update session');
    }
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>
            <QrCode size={26} style={{ verticalAlign: 'text-bottom', marginRight: '0.45rem' }} />
            Donate / PromptPay
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            ตั้งค่าปุ่มโดเนทและบัญชีรับเงิน PromptPay
          </p>
        </div>
      </div>

      {/* Setup */}
      <section className="admin-edit-section">
        <h2>Setup</h2>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Enable donate button</span>
            <label className="admin-support-toggle">
              <input type="checkbox" checked={Boolean(form.enabled)} onChange={updateField('enabled')} />
              <span>{form.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </label>
          <label>
            <span className="form-label">Receiver type</span>
            <select className="form-input" value={form.receiverType} onChange={updateField('receiverType')}>
              <option value="phone">Phone number</option>
              <option value="national_id">National ID</option>
            </select>
          </label>
          <label>
            <span className="form-label">Receiver value ({form.receiverType === 'phone' ? 'e.g. 0812345678' : '13-digit ID'})</span>
            <input className="form-input" value={form.receiverValue} onChange={updateField('receiverValue')} placeholder={form.receiverType === 'phone' ? '0812345678' : '1234567890123'} />
          </label>
          <label>
            <span className="form-label">Receiver display name</span>
            <input className="form-input" value={form.receiverName} onChange={updateField('receiverName')} placeholder="e.g. MoodsWatch" />
          </label>
        </div>
      </section>

      {/* Amount config */}
      <section className="admin-edit-section">
        <h2>Amount Settings</h2>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Minimum amount (THB)</span>
            <input className="form-input" type="number" min="1" value={form.minAmount} onChange={updateField('minAmount')} />
          </label>
          <label>
            <span className="form-label">Maximum amount (THB)</span>
            <input className="form-input" type="number" min="1" value={form.maxAmount} onChange={updateField('maxAmount')} />
          </label>
          <label className="admin-form-grid-wide">
            <span className="form-label">Preset amounts (comma separated)</span>
            <input className="form-input" value={form.presetAmountsRaw} onChange={updateField('presetAmountsRaw')} placeholder="20, 50, 100, 300, 500" />
          </label>
          <label>
            <span className="form-label">Allow open amount</span>
            <label className="admin-support-toggle">
              <input type="checkbox" checked={Boolean(form.allowOpenAmount)} onChange={updateField('allowOpenAmount')} />
              <span>{form.allowOpenAmount ? 'Allowed' : 'Fixed only'}</span>
            </label>
          </label>
        </div>
      </section>

      {/* Copy */}
      <section className="admin-edit-section">
        <h2>Campaign Copy</h2>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Campaign name (TH)</span>
            <input className="form-input" value={form.campaignNameTh} onChange={updateField('campaignNameTh')} />
          </label>
          <label>
            <span className="form-label">Campaign name (EN)</span>
            <input className="form-input" value={form.campaignNameEn} onChange={updateField('campaignNameEn')} />
          </label>
          <label>
            <span className="form-label">Thank you message (TH)</span>
            <input className="form-input" value={form.thankYouTh} onChange={updateField('thankYouTh')} />
          </label>
          <label>
            <span className="form-label">Thank you message (EN)</span>
            <input className="form-input" value={form.thankYouEn} onChange={updateField('thankYouEn')} />
          </label>
        </div>
      </section>

      <div className="admin-form-actions">
        <button type="button" className="secondary-btn" onClick={handleReset}>
          <RotateCcw size={16} /> Reset defaults
        </button>
        <button type="button" className="primary-btn" onClick={handleSave} disabled={isSaving}>
          <Save size={16} /> {isSaving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {/* Donation sessions */}
      <section className="admin-edit-section" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0 }}>Donation Sessions</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Filter:</span>
            <select className="form-input" style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSessionsPage(1); }}>
              <option value="all">All</option>
              <option value="qr_generated">QR Generated</option>
              <option value="paid">Paid</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Total: {sessionsTotal} sessions
        </p>

        {loadingSessions ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No sessions found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Donor</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Mode</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const statusInfo = STATUS_LABELS[s.status] || { label: s.status, color: '#6b7280' };
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(s.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', fontWeight: 500 }}>
                        {s.donor_name || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontWeight: 400 }}>Anonymous</span>}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>
                        {s.mode === 'open' ? '—' : `฿${Number(s.amount).toLocaleString('th-TH')}`}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)' }}>
                        {s.mode}
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>
                        <span style={{ color: statusInfo.color, fontWeight: 600, fontSize: '0.8rem' }}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.55rem 0.75rem' }}>
                        {s.status !== 'paid' && s.status !== 'expired' && (
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            onClick={() => handleMarkPaid(s.id)}
                          >
                            <CheckCircle2 size={13} /> Mark paid
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sessionsTotal > 30 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button type="button" className="secondary-btn" disabled={sessionsPage <= 1} onClick={() => setSessionsPage((p) => p - 1)}>
              Previous
            </button>
            <span style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {sessionsPage} / {Math.ceil(sessionsTotal / 30)}
            </span>
            <button type="button" className="secondary-btn" disabled={sessionsPage >= Math.ceil(sessionsTotal / 30)} onClick={() => setSessionsPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
