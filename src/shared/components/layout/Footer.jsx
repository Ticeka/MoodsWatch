import React from 'react';
import { Link } from 'react-router-dom';
import { Coffee, Heart, Sparkles } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { BRAND_NAME, BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from '@/shared/config/brand';
import { SUPPORT_STRIPE_COFFEE_URL } from '@/shared/config/support';
import { useSupportConfig } from '@/shared/hooks/useSupportConfig';

export function Footer() {
  const { t, pick } = useLanguage();
  const supportConfig = useSupportConfig();

  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-brand">
          <Link to="/" className="logo">
            <span className="logo-icon">
              <Sparkles size={19} />
            </span>
            <span className="logo-wordmark">{BRAND_WORDMARK_LEAD}<span className="logo-accent">{BRAND_WORDMARK_ACCENT}</span></span>
          </Link>
          <p className="footer-desc">{t('layout.footerDesc')}</p>
        </div>

        <div className="footer-links">
          <div className="link-group">
            <h4>{t('layout.menu')}</h4>
            <Link to="/">{t('layout.home')}</Link>
            <Link to="/battle">{t('layout.battle')}</Link>
            <Link to="/tierlist">{t('layout.tierlist')}</Link>
            <Link to="/discover">{t('layout.discover')}</Link>
            <Link to="/watchlist">{t('layout.watchlist')}</Link>
            <Link to="/stats">{t('layout.stats')}</Link>
            <Link to="/profile">{t('layout.profile')}</Link>
          </div>
          <div className="link-group">
            <h4>{t('layout.more')}</h4>
            <Link to="#">{t('layout.about')}</Link>
            <Link to="#">{t('layout.contact')}</Link>
          </div>
        </div>
      </div>
      <div className="footer-support-strip">
        <div className="container">
          <a
            href={SUPPORT_STRIPE_COFFEE_URL || undefined}
            target={SUPPORT_STRIPE_COFFEE_URL ? '_blank' : undefined}
            rel={SUPPORT_STRIPE_COFFEE_URL ? 'noreferrer' : undefined}
            className={`footer-support-link${SUPPORT_STRIPE_COFFEE_URL ? '' : ' is-disabled'}`}
            aria-disabled={!SUPPORT_STRIPE_COFFEE_URL}
            onClick={(event) => {
              if (!SUPPORT_STRIPE_COFFEE_URL) {
                event.preventDefault();
              }
            }}
          >
            <span className="footer-support-icon"><Coffee size={14} /></span>
            <span className="footer-support-copy">
              <strong>{pick(supportConfig.footerLabelTh, supportConfig.footerLabelEn)}</strong>
              <span>{pick(supportConfig.footerHintTh, supportConfig.footerHintEn)}</span>
            </span>
            <Heart size={13} className="footer-support-heart" fill="currentColor" />
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} {BRAND_NAME} | {t('layout.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
