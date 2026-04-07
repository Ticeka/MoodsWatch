import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Sparkles, Star, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitleFormatBadge, getTitleTypeMeta } from '@/shared/lib/titleType';
import { SearchMatchReasons } from '@/features/discover/components/SearchMatchReasons';
import { SearchHighlightText } from '@/features/discover/components/SearchHighlightText';
import { collectMatchReasonKeys } from '@/features/discover/lib/searchMatch';
import '../styles/DiscoverTitleCard.css';

function formatCompactNumber(value, locale) {
  const number = Number(value || 0);
  if (!number) {
    return null;
  }

  try {
    return new Intl.NumberFormat(locale, {
      notation: number >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: number >= 10000 ? 1 : 0,
    }).format(number);
  } catch {
    return String(number);
  }
}

export function DiscoverTitleCard({ title, query = '', onOpen = null }) {
  const { language, t } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const displayTitle = (language === 'th' ? title.title_th : title.title_en) || title.title_en || title.title_th || title.title_native || 'Unknown title';
  const supportingTitle = (language === 'th' ? title.title_en : title.title_th) || title.title_native || '';
  const shortSynopsis = String(title.synopsis || '').trim();
  const coverAlt = title.title_en || title.title_th || title.title_native || displayTitle;
  const typeMeta = getTitleTypeMeta(title.type, language);
  const formatBadge = getTitleFormatBadge(title);
  const popularity = formatCompactNumber(title.popularity, locale);
  const score = Number(title.score || 0);
  const genres = (title.genres || []).slice(0, 3);
  const moods = (title.moods || []).slice(0, 2);
  const matchReasonKeys = collectMatchReasonKeys(query, [
    { reasonKey: 'matchReasonTitle', texts: [displayTitle, supportingTitle, title.title_native, title.slug] },
    { reasonKey: 'matchReasonSynopsis', texts: [shortSynopsis] },
    { reasonKey: 'matchReasonGenre', texts: title.genres || [] },
    { reasonKey: 'matchReasonMood', texts: title.moods || [] },
  ]);

  return (
    <Link to={`/title/${title.slug}`} className="discover-title-card" onClick={onOpen}>
      <div className="discover-title-poster-wrap">
        <img
          src={title.cover}
          alt={coverAlt}
          className="discover-title-poster"
          loading="lazy"
          decoding="async"
        />
        <div className="discover-title-poster-overlay" />
        <div className="discover-title-poster-top">
          <span className="discover-title-chip discover-title-chip-type">{typeMeta.displayLabel}</span>
          <span className="discover-title-chip">{title.year || formatBadge}</span>
        </div>
        <div className="discover-title-poster-bottom">
          <span className="discover-title-chip discover-title-chip-ghost">{formatBadge}</span>
          <span className="discover-title-open">
            <ArrowUpRight size={14} aria-hidden="true" />
            {t('discover.openTitle')}
          </span>
        </div>
      </div>

      <div className="discover-title-body">
        <div className="discover-title-head">
          <div className="discover-title-copy">
            <h3><SearchHighlightText text={displayTitle} query={query} /></h3>
            {supportingTitle && supportingTitle !== displayTitle ? (
              <p className="discover-title-supporting"><SearchHighlightText text={supportingTitle} query={query} /></p>
            ) : null}
          </div>
          {(score > 0 || popularity) && (
            <div className="discover-title-stats" aria-label={t('discover.titleMetaAria')}>
              {score > 0 ? (
                <span className="discover-title-stat">
                  <Star size={12} aria-hidden="true" />
                  {score}
                </span>
              ) : null}
              {popularity ? (
                <span className="discover-title-stat">
                  <TrendingUp size={12} aria-hidden="true" />
                  {popularity}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <p className="discover-title-synopsis">
          {shortSynopsis ? <SearchHighlightText text={shortSynopsis} query={query} /> : t('discover.titleCardFallback')}
        </p>

        <SearchMatchReasons reasonKeys={matchReasonKeys} t={t} />

        <div className="discover-title-tags">
          {genres.map((genre) => (
            <span key={genre} className="discover-title-tag">
              <SearchHighlightText text={genre} query={query} />
            </span>
          ))}
          {moods.map((mood) => (
            <span key={mood} className="discover-title-tag is-mood">
              <Sparkles size={11} aria-hidden="true" />
              <SearchHighlightText text={mood} query={query} />
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
