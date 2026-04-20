import React, { useEffect, useMemo } from 'react';
import { Coffee, Heart, QrCode, Sparkles, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { BRAND_NAME } from '@/shared/config/brand';
import { SUPPORT_STRIPE_COFFEE_URL } from '@/shared/config/support';

export function CoffeeSupportModal({ pick, open, onClose, onSupport, onPromptPay, config, donateEnabled = false, dismissToday = false, onDismissTodayChange }) {
  const hasStripeLink = Boolean(SUPPORT_STRIPE_COFFEE_URL);
  const primaryLabel = useMemo(
    () => config ? pick(config.primaryCtaTh, config.primaryCtaEn) : pick('เลี้ยงกาแฟให้ทีมหน่อย', 'Buy us a coffee'),
    [config, pick]
  );
  const promptPayLabel = useMemo(
    () => pick('โดเนทผ่าน PromptPay', 'Donate via PromptPay'),
    [pick]
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="coffee-support-backdrop" onClick={onClose} role="presentation">
      <section
        className={`coffee-support-modal${hasStripeLink ? ' coffee-support-modal--no-note' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coffee-support-title"
        aria-describedby="coffee-support-desc"
      >
        <button
          type="button"
          className="coffee-support-close"
          onClick={onClose}
          aria-label={pick('ปิดหน้าต่างสนับสนุน', 'Close support prompt')}
        >
          <X size={18} />
        </button>

        <div className="coffee-support-art" aria-hidden="true">
          <span className="coffee-support-art-ring coffee-support-art-ring--one" />
          <span className="coffee-support-art-ring coffee-support-art-ring--two" />
          <div className="coffee-support-mascot">
            <span className="coffee-support-mascot-heart"><Heart size={16} fill="currentColor" /></span>
            <Coffee size={34} />
          </div>
          <span className="coffee-support-star coffee-support-star--left"><Sparkles size={14} /></span>
          <span className="coffee-support-star coffee-support-star--right"><Sparkles size={18} /></span>
        </div>

        <div className="coffee-support-copy">
          <span className="coffee-support-kicker">
            <Heart size={14} />
            {pick(config?.kickerTh || 'มุมขอกำลังใจเล็ก ๆ', config?.kickerEn || 'A tiny support corner')}
          </span>
          <h2 id="coffee-support-title">
            {pick(config?.titleTh || 'อยู่เป็นเพื่อนเรามาสักพักแล้ว...', config?.titleEn || 'You have been hanging out with us for a while...')}
          </h2>
          <p id="coffee-support-desc">
            {pick(
              config?.bodyTh || `${BRAND_NAME} กำลังพยายามเป็นเว็บที่น่ารักและใช้งานสบายขึ้นทุกวัน ถ้าอยากช่วยค่ากาแฟเล็ก ๆ ผ่าน Stripe เราจะดีใจมาก`,
              config?.bodyEn || `${BRAND_NAME} is trying to stay cute, cozy, and a little better every day. If you want to chip in for a tiny coffee through Stripe, it would mean a lot.`
            )}
          </p>

          <div className="coffee-support-plea" aria-label={pick('เหตุผลที่ขอค่ากาแฟ', 'Why we are asking')}>
            <span>{pick('คาเฟอีนไว้แก้บั๊กดึก ๆ', 'Fuel for late-night bug fixes')}</span>
            <span>{pick('เซิร์ฟเวอร์จะได้ไม่งอน', 'Helps keep the servers sweet')}</span>
            <span>{pick('แลกกับฟีเจอร์น่ารักเพิ่มอีกนิด', 'Trades nicely for more charming features')}</span>
          </div>
        </div>

        <div className="coffee-support-actions">
          <Button
            variant="primary"
            className="coffee-support-primary"
            onClick={onSupport}
            disabled={!hasStripeLink}
            icon={<Coffee size={16} />}
          >
            {primaryLabel}
          </Button>
          {donateEnabled ? (
            <Button
              variant="secondary"
              className="coffee-support-promptpay"
              onClick={onPromptPay}
              icon={<QrCode size={16} />}
            >
              {promptPayLabel}
            </Button>
          ) : null}
          <Button variant="ghost" className="coffee-support-secondary" onClick={onClose}>
            {pick(config?.secondaryCtaTh || 'ไว้ก่อน เดี๋ยวกลับมา', config?.secondaryCtaEn || 'Maybe later')}
          </Button>
          <label className="coffee-support-dismiss-today">
            <input
              type="checkbox"
              checked={dismissToday}
              onChange={(e) => onDismissTodayChange?.(e.target.checked)}
            />
            <span>{pick('ไม่แสดงอีกในวันนี้', "Don't show again today")}</span>
          </label>
        </div>

        {!hasStripeLink ? (
          <p className="coffee-support-note">
            {pick('ยังไม่ได้ตั้งค่า Stripe link ในระบบ ปุ่มนี้เลยยังไม่เปิดใช้งาน', 'Stripe link is not configured yet, so the support button is disabled for now.')}
          </p>
        ) : null}
      </section>
    </div>
  );
}
