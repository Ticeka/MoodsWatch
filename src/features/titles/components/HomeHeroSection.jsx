import React from 'react';
import { Dices, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { getLocalizedMoodName } from '@/shared/data/moods';

export function HomeHeroSection({
  heroBlock,
  heroLead,
  heroTitle,
  heroAccent,
  heroSubtitle,
  heroCtaLabel,
  heroCtaHref,
  quickMoods,
  moods,
  language,
  onQuickMood,
  onRandomPick,
  t,
}) {
  return (
    <section className="hero-section">
      <div className="hero-bg-effects">
        <div className="hero-orb hero-orb-1"></div>
        <div className="hero-orb hero-orb-2"></div>
        <div className="hero-orb hero-orb-3"></div>
        <div className="hero-grid-pattern"></div>
      </div>
      <div className="container hero-container text-center">
        <div className="hero-badge animate-fade-in-up">
          <span className="hero-badge-dot"></span>
          {heroBlock?.config?.badgeLabel || t('home.heroBadge')}
        </div>
        <h1 className="hero-title animate-fade-in-up">
          {heroLead}
          {heroTitle.includes(heroAccent) && <span className="text-gradient">{heroAccent}</span>}
        </h1>
        <p className="hero-subtitle animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {heroSubtitle}
        </p>

        <div className="quick-moods animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          {quickMoods.map((mood) => (
            <button
              key={mood.id}
              type="button"
              className={`quick-mood-chip ${moods.includes(mood.id) ? 'active' : ''}`}
              onClick={() => onQuickMood(mood.id)}
              style={{ '--chip-color': mood.color }}
            >
              <span>{mood.icon}</span> {getLocalizedMoodName(mood, language)}
            </button>
          ))}
        </div>

        <div className="hero-actions animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          {heroCtaHref ? (
            <Link to={heroCtaHref} className="hero-link-btn">
              <span className="btn-icon"><Sparkles size={18} /></span>
              <span className="btn-text">{heroCtaLabel}</span>
            </Link>
          ) : (
            <Button
              size="lg"
              icon={<Sparkles size={18} />}
              onClick={() => {
                const el = document.getElementById('finder-section');
                if (!el) return;
                window.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
              }}
            >
              {heroCtaLabel}
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={onRandomPick} icon={<Dices size={18} />}>
            {t('home.randomPick')}
          </Button>
        </div>

        <div className="hero-quick-links animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <Link to="/discover" className="quick-link">
            <span>{t('common.browse')}</span> {t('home.discoverLink')}
          </Link>
          <Link to="/watchlist" className="quick-link">
            <span>{t('common.list')}</span> {t('home.watchlistLink')}
          </Link>
        </div>
      </div>
    </section>
  );
}
