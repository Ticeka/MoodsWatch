import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Download, Heart, Loader2, Printer, QrCode, RefreshCw, X } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { generatePromptPayPayload } from '../lib/promptpay';
import './DonateModal.css';

const PRESET_AMOUNTS = [20, 50, 100, 300, 500];

export function DonateModal({ open, onClose, config }) {
  const { pick } = useLanguage();

  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isOpenAmount, setIsOpenAmount] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState(null);

  const presets = config?.presetAmounts?.length ? config.presetAmounts : PRESET_AMOUNTS;

  const getAmount = () => {
    if (isOpenAmount) return null;
    if (selectedPreset != null) return selectedPreset;
    const v = parseFloat(customAmount);
    return Number.isFinite(v) ? v : null;
  };

  const validateAmount = () => {
    if (isOpenAmount) return '';
    const amount = getAmount();
    if (amount == null || amount <= 0) return pick('กรุณากรอกจำนวนเงิน', 'Please enter an amount');
    if (amount < (config?.minAmount ?? 1)) return pick(`ขั้นต่ำ ${config?.minAmount ?? 1} บาท`, `Minimum ${config?.minAmount ?? 1} THB`);
    if (amount > (config?.maxAmount ?? 100000)) return pick(`ไม่เกิน ${config?.maxAmount ?? 100000} บาท`, `Maximum ${config?.maxAmount ?? 100000} THB`);
    return '';
  };

  const reset = useCallback(() => {
    setSelectedPreset(null);
    setCustomAmount('');
    setIsOpenAmount(false);
    setError('');
    setQrDataUrl(null);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => { if (!open) reset(); }, [open, reset]);

  const handleGenerate = async () => {
    const validationError = validateAmount();
    if (validationError) { setError(validationError); return; }
    setError('');
    setIsGenerating(true);
    try {
      const amount = getAmount();
      const payload = generatePromptPayPayload({
        receiverType: config.receiverType,
        receiverValue: config.receiverValue,
        amount,
      });
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 300,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setError(pick('เกิดข้อผิดพลาด กรุณาลองใหม่', 'Something went wrong, please try again'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const amount = getAmount();
    const label = isOpenAmount ? 'open' : `${amount}thb`;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `donate-moodswatch-${label}-${Date.now()}.png`;
    link.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const amount = getAmount();
    const amountText = isOpenAmount
      ? pick('ใส่ยอดเองในแอปธนาคาร', 'Enter amount in banking app')
      : `${Number(amount).toLocaleString('th-TH')} บาท`;
    const campaignName = pick(config?.campaignNameTh, config?.campaignNameEn);
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR โดเนท</title>
      <style>body{font-family:sans-serif;text-align:center;padding:3rem;color:#111}h1{font-size:1.6rem;margin-bottom:.5rem}p{color:#555;margin:.3rem 0}img{margin:1.5rem auto;display:block;width:260px;height:260px}.amount{font-size:2rem;font-weight:700;color:#111;margin:1rem 0}.note{font-size:.8rem;color:#888;margin-top:2rem;border-top:1px solid #eee;padding-top:1rem}</style>
      </head><body>
      <h1>${campaignName}</h1>
      <p>ผู้รับ: <strong>${config?.receiverName || 'PromptPay'}</strong></p>
      <div class="amount">${amountText}</div>
      <img src="${qrDataUrl}" alt="PromptPay QR Code"/>
      <p>สแกนด้วยแอปธนาคารเพื่อโอนเงิน</p>
      <div class="note">กรุณาตรวจสอบชื่อผู้รับก่อนชำระเงินทุกครั้ง</div>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const amount = getAmount();

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="donate-backdrop" onClick={onClose} role="presentation">
      <section
        className="donate-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="donate-title"
      >
        {/* Header */}
        <div className="donate-header">
          <div className="donate-header-copy">
            <span className="donate-kicker">
              <Heart size={13} fill="currentColor" />
              {pick('สนับสนุนเรา', 'Support us')}
            </span>
            <h2 id="donate-title">{pick(config?.campaignNameTh, config?.campaignNameEn)}</h2>
          </div>
          <button type="button" className="donate-close" onClick={onClose} aria-label={pick('ปิด', 'Close')}>
            <X size={18} />
          </button>
        </div>

        {/* QR view */}
        {qrDataUrl ? (
          <div className="donate-qr-section">
            <div className="donate-qr-card">
              <img src={qrDataUrl} alt="PromptPay QR Code" className="donate-qr-img" />
              <p className="donate-qr-receiver">{pick('ผู้รับ', 'Receiver')}: <strong>{config?.receiverName || 'PromptPay'}</strong></p>
              {!isOpenAmount && amount ? (
                <p className="donate-qr-amount">{Number(amount).toLocaleString('th-TH')} <span>บาท</span></p>
              ) : (
                <p className="donate-qr-amount-open">{pick('ใส่ยอดเองในแอปธนาคาร', 'Enter amount in banking app')}</p>
              )}
              <p className="donate-qr-instruction">{pick('สแกนด้วยแอปธนาคารเพื่อโอนเงิน', 'Scan with your banking app to transfer')}</p>
              <p className="donate-qr-note">{pick('กรุณาตรวจสอบชื่อผู้รับก่อนชำระเงินทุกครั้ง', 'Always verify receiver name before payment')}</p>
            </div>

            <div className="donate-qr-actions">
              <button type="button" className="donate-btn-icon" onClick={handlePrint}>
                <Printer size={15} />{pick('พิมพ์ QR', 'Print QR')}
              </button>
              <button type="button" className="donate-btn-icon" onClick={handleDownload}>
                <Download size={15} />{pick('ดาวน์โหลด', 'Download')}
              </button>
              <button type="button" className="donate-btn-icon donate-btn-ghost" onClick={reset}>
                <RefreshCw size={15} />{pick('สร้างใหม่', 'New QR')}
              </button>
            </div>
          </div>
        ) : (
          /* Amount form */
          <div className="donate-form">
            <div className="donate-section-label">{pick('เลือกจำนวนเงิน', 'Select amount')}</div>
            <div className="donate-presets">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`donate-preset-btn${selectedPreset === p && !isOpenAmount ? ' is-selected' : ''}`}
                  onClick={() => { setSelectedPreset(p); setIsOpenAmount(false); setCustomAmount(''); setError(''); }}
                >
                  {Number(p).toLocaleString('th-TH')}
                </button>
              ))}
            </div>

            <div className="donate-input-wrap">
              <input
                type="number"
                className={`donate-input${error ? ' is-error' : ''}`}
                placeholder={pick('กรอกจำนวนเงินเอง', 'Enter custom amount')}
                value={customAmount}
                min="1"
                step="1"
                disabled={isOpenAmount}
                onChange={(e) => { setCustomAmount(e.target.value); setSelectedPreset(null); setIsOpenAmount(false); setError(''); }}
              />
              <span className="donate-input-suffix">฿</span>
            </div>

            {config?.allowOpenAmount && (
              <label className="donate-open-toggle">
                <input
                  type="checkbox"
                  checked={isOpenAmount}
                  onChange={(e) => { setIsOpenAmount(e.target.checked); if (e.target.checked) { setSelectedPreset(null); setCustomAmount(''); } setError(''); }}
                />
                <span>{pick('ใส่ยอดเองตอนโอน', "I'll enter amount in banking app")}</span>
              </label>
            )}

            {error && <p className="donate-error">{error}</p>}

            <button
              type="button"
              className="donate-btn-primary donate-generate-btn"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating
                ? <><Loader2 size={16} className="donate-spinner" />{pick('กำลังสร้าง QR…', 'Generating…')}</>
                : <><QrCode size={16} />{pick('สร้าง QR เพื่อโดเนท', 'Generate Donation QR')}</>
              }
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
