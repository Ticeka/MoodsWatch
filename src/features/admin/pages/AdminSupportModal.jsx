import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Coffee, RotateCcw, Save } from 'lucide-react';
import {
  DEFAULT_SUPPORT_CONFIG,
  resetSupportConfig,
  saveSupportConfig,
  SUPPORT_MODAL_OPEN_EVENT,
  SUPPORT_STRIPE_COFFEE_URL,
} from '@/shared/config/support';
import { useSupportConfig } from '@/shared/hooks/useSupportConfig';

function mapConfigToForm(config) {
  return {
    ...config,
    modalDelaySec: Math.round(Number(config.modalDelayMs || DEFAULT_SUPPORT_CONFIG.modalDelayMs) / 1000),
  };
}

export function AdminSupportModal() {
  const supportConfig = useSupportConfig();
  const [form, setForm] = useState(() => mapConfigToForm(supportConfig));

  useEffect(() => {
    setForm(mapConfigToForm(supportConfig));
  }, [supportConfig]);

  const stripeStatus = useMemo(
    () => (SUPPORT_STRIPE_COFFEE_URL ? 'Connected' : 'Missing Stripe link'),
    []
  );

  const updateField = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    const normalized = saveSupportConfig({
      ...form,
      modalDelayMs: Math.max(5, Number(form.modalDelaySec || 75)) * 1000,
    });
    setForm(mapConfigToForm(normalized));
    toast.success('Saved support modal settings');
  };

  const handleReset = () => {
    const next = resetSupportConfig();
    setForm(mapConfigToForm(next));
    toast.success('Reset support modal settings');
  };

  const handleOpenPreview = () => {
    const normalized = saveSupportConfig({
      ...form,
      modalDelayMs: Math.max(5, Number(form.modalDelaySec || 75)) * 1000,
    });
    setForm(mapConfigToForm(normalized));
    window.dispatchEvent(new Event(SUPPORT_MODAL_OPEN_EVENT));
    toast.success('Opened support modal preview');
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>
            <Coffee size={26} style={{ verticalAlign: 'text-bottom', marginRight: '0.45rem' }} />
            Support Modal
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Tune the support popup copy, CTA labels, and timing without touching code.
          </p>
        </div>
      </div>

      <section className="admin-edit-section">
        <h2>Setup</h2>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Status</span>
            <label className="admin-support-toggle">
              <input type="checkbox" checked={Boolean(form.enabled)} onChange={updateField('enabled')} />
              <span>{form.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </label>
          <label>
            <span className="form-label">Popup delay (seconds)</span>
            <input className="form-input" type="number" min="5" max="900" value={form.modalDelaySec} onChange={updateField('modalDelaySec')} />
          </label>
          <label className="admin-form-grid-wide">
            <span className="form-label">Stripe link</span>
            <input className="form-input" value={SUPPORT_STRIPE_COFFEE_URL || 'Not configured in .env'} disabled />
            <p className="admin-helper-text">
              {stripeStatus}. Add `VITE_STRIPE_COFFEE_URL` in `.env` to activate payments.
            </p>
          </label>
        </div>
      </section>

      <section className="admin-edit-section">
        <h2>Modal Copy</h2>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Kicker (TH)</span>
            <input className="form-input" value={form.kickerTh} onChange={updateField('kickerTh')} />
          </label>
          <label>
            <span className="form-label">Kicker (EN)</span>
            <input className="form-input" value={form.kickerEn} onChange={updateField('kickerEn')} />
          </label>
          <label>
            <span className="form-label">Title (TH)</span>
            <input className="form-input" value={form.titleTh} onChange={updateField('titleTh')} />
          </label>
          <label>
            <span className="form-label">Title (EN)</span>
            <input className="form-input" value={form.titleEn} onChange={updateField('titleEn')} />
          </label>
          <label className="admin-form-grid-wide">
            <span className="form-label">Body (TH)</span>
            <textarea className="form-input" rows="3" value={form.bodyTh} onChange={updateField('bodyTh')} />
          </label>
          <label className="admin-form-grid-wide">
            <span className="form-label">Body (EN)</span>
            <textarea className="form-input" rows="3" value={form.bodyEn} onChange={updateField('bodyEn')} />
          </label>
          <label>
            <span className="form-label">Primary button (TH)</span>
            <input className="form-input" value={form.primaryCtaTh} onChange={updateField('primaryCtaTh')} />
          </label>
          <label>
            <span className="form-label">Primary button (EN)</span>
            <input className="form-input" value={form.primaryCtaEn} onChange={updateField('primaryCtaEn')} />
          </label>
          <label>
            <span className="form-label">Secondary button (TH)</span>
            <input className="form-input" value={form.secondaryCtaTh} onChange={updateField('secondaryCtaTh')} />
          </label>
          <label>
            <span className="form-label">Secondary button (EN)</span>
            <input className="form-input" value={form.secondaryCtaEn} onChange={updateField('secondaryCtaEn')} />
          </label>
        </div>
      </section>

      <section className="admin-edit-section">
        <h2>Compact CTAs</h2>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Footer label (TH)</span>
            <input className="form-input" value={form.footerLabelTh} onChange={updateField('footerLabelTh')} />
          </label>
          <label>
            <span className="form-label">Footer label (EN)</span>
            <input className="form-input" value={form.footerLabelEn} onChange={updateField('footerLabelEn')} />
          </label>
          <label>
            <span className="form-label">Footer hint (TH)</span>
            <input className="form-input" value={form.footerHintTh} onChange={updateField('footerHintTh')} />
          </label>
          <label>
            <span className="form-label">Footer hint (EN)</span>
            <input className="form-input" value={form.footerHintEn} onChange={updateField('footerHintEn')} />
          </label>
          <label>
            <span className="form-label">Menu label (TH)</span>
            <input className="form-input" value={form.menuLabelTh} onChange={updateField('menuLabelTh')} />
          </label>
          <label>
            <span className="form-label">Menu label (EN)</span>
            <input className="form-input" value={form.menuLabelEn} onChange={updateField('menuLabelEn')} />
          </label>
          <label>
            <span className="form-label">Profile dropdown label (TH)</span>
            <input className="form-input" value={form.profileLabelTh} onChange={updateField('profileLabelTh')} />
          </label>
          <label>
            <span className="form-label">Profile dropdown label (EN)</span>
            <input className="form-input" value={form.profileLabelEn} onChange={updateField('profileLabelEn')} />
          </label>
          <label>
            <span className="form-label">Guest hint (TH)</span>
            <input className="form-input" value={form.guestHintTh} onChange={updateField('guestHintTh')} />
          </label>
          <label>
            <span className="form-label">Guest hint (EN)</span>
            <input className="form-input" value={form.guestHintEn} onChange={updateField('guestHintEn')} />
          </label>
        </div>
      </section>

      <section className="admin-edit-section">
        <h2>Preview</h2>
        <div className="admin-support-preview">
          <div className="admin-support-preview-card">
            <span className="admin-support-preview-kicker">{form.kickerTh}</span>
            <strong>{form.titleTh}</strong>
            <p>{form.bodyTh}</p>
            <div className="admin-support-preview-actions">
              <button type="button" className="primary-btn">{form.primaryCtaTh}</button>
              <button type="button" className="secondary-btn">{form.secondaryCtaTh}</button>
            </div>
          </div>
        </div>
      </section>

      <div className="admin-form-actions">
        <button type="button" className="secondary-btn" onClick={handleOpenPreview}>
          <Coffee size={16} /> Preview modal now
        </button>
        <button type="button" className="secondary-btn" onClick={handleReset}>
          <RotateCcw size={16} /> Reset defaults
        </button>
        <button type="button" className="primary-btn" onClick={handleSave}>
          <Save size={16} /> Save settings
        </button>
      </div>
    </div>
  );
}
