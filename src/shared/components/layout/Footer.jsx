import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { BRAND_NAME, BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from '@/shared/config/brand';

export function Footer() {
  const { t } = useLanguage();

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
      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} {BRAND_NAME} | {t('layout.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
