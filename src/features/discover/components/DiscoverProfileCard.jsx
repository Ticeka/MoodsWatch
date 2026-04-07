import React from 'react';
import { Link } from 'react-router-dom';
import { collectMatchReasonKeys } from '@/features/discover/lib/searchMatch';
import { formatCompactDate } from '@/features/discover/lib/discoverPageUtils';
import { SearchHighlightText } from './SearchHighlightText';
import { SearchMatchReasons } from './SearchMatchReasons';

export function DiscoverProfileCard({ profile, locale, t, query = '', onOpen = null }) {
  const Component = profile?.username ? Link : 'article';
  const componentProps = profile?.username ? { to: `/u/${profile.username}`, onClick: onOpen } : {};
  const avatarInitial = (profile?.name || profile?.username || '?').charAt(0).toUpperCase();
  const moods = Array.isArray(profile?.favorite_moods) ? profile.favorite_moods.slice(0, 3) : [];
  const matchReasonKeys = collectMatchReasonKeys(query, [
    { reasonKey: 'matchReasonAuthor', texts: [profile?.name, profile?.username] },
    { reasonKey: 'matchReasonBio', texts: [profile?.bio] },
    { reasonKey: 'matchReasonMood', texts: profile?.favorite_moods || [] },
  ]);

  return (
    <Component className="discover-entity-card discover-profile-card" {...componentProps}>
      <div className="discover-profile-head">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="discover-profile-avatar" loading="lazy" />
        ) : (
          <span className="discover-profile-avatar discover-profile-avatar-fallback" aria-hidden="true">
            {avatarInitial}
          </span>
        )}
        <div className="discover-profile-copy">
          <strong><SearchHighlightText text={profile?.name || profile?.username || t('discover.unknownUser')} query={query} /></strong>
          {profile?.username ? <span>@<SearchHighlightText text={profile.username} query={query} /></span> : null}
        </div>
      </div>
      <p className="discover-entity-description">
        {profile?.bio ? <SearchHighlightText text={profile.bio} query={query} /> : t('discover.peopleCardFallback')}
      </p>
      <SearchMatchReasons reasonKeys={matchReasonKeys} t={t} />
      <div className="discover-entity-meta">
        <span className="discover-entity-pill">{t('discover.scopePeople')}</span>
        {profile?.created_at ? <span>{formatCompactDate(profile.created_at, locale)}</span> : null}
      </div>
      {moods.length > 0 ? (
        <div className="discover-inline-tags">
          {moods.map((moodId) => (
            <span key={moodId} className="discover-inline-tag">
              <SearchHighlightText text={moodId} query={query} />
            </span>
          ))}
        </div>
      ) : null}
    </Component>
  );
}
