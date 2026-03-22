import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { SearchMatchReasons } from '@/features/discover/components/SearchMatchReasons';
import { SearchHighlightText } from '@/features/discover/components/SearchHighlightText';
import { collectMatchReasonKeys } from '@/features/discover/lib/searchMatch';
import './DiscoverPostCard.css';

function formatCompactDate(value, locale) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export function DiscoverPostCard({ post, locale, t, query = '', onOpen = null }) {
  const authorLabel = post.author_name || post.author_username || t('discover.unknownUser');
  const authorInitial = authorLabel.charAt(0).toUpperCase();
  const excerpt = String(post.content || '').trim();
  const hasImage = Boolean(post.image_url);
  const title = post.title;
  const titleLabel = title?.title_en || title?.title_th || title?.title_native || title?.slug || '';
  const formattedDate = formatCompactDate(post.created_at, locale);
  const matchReasonKeys = collectMatchReasonKeys(query, [
    { reasonKey: 'matchReasonAuthor', texts: [post.author_name, post.author_username] },
    { reasonKey: 'matchReasonCaption', texts: [excerpt] },
    { reasonKey: 'matchReasonTaggedTitle', texts: [titleLabel, title?.title_native, title?.slug] },
  ]);

  return (
    <article className="discover-entity-card discover-post-card">
      <div className="discover-post-head">
        {post.author_username ? (
          <Link to={`/u/${post.author_username}`} className="discover-post-author">
            {post.author_avatar ? (
              <img src={post.author_avatar} alt="" className="discover-profile-avatar" loading="lazy" />
            ) : (
              <span className="discover-profile-avatar discover-profile-avatar-fallback" aria-hidden="true">
                {authorInitial}
              </span>
            )}
            <span className="discover-post-author-copy">
              <strong><SearchHighlightText text={authorLabel} query={query} /></strong>
              <span>@<SearchHighlightText text={post.author_username} query={query} /></span>
            </span>
          </Link>
        ) : (
          <div className="discover-post-author">
            {post.author_avatar ? (
              <img src={post.author_avatar} alt="" className="discover-profile-avatar" loading="lazy" />
            ) : (
              <span className="discover-profile-avatar discover-profile-avatar-fallback" aria-hidden="true">
                {authorInitial}
              </span>
            )}
            <span className="discover-post-author-copy">
              <strong><SearchHighlightText text={authorLabel} query={query} /></strong>
              <span>{formattedDate}</span>
            </span>
          </div>
        )}

        <span className="discover-entity-pill">{t('discover.scopePosts')}</span>
      </div>

      <p className="discover-post-content">
        {excerpt ? <SearchHighlightText text={excerpt} query={query} /> : t('discover.postCardFallback')}
      </p>

      <SearchMatchReasons reasonKeys={matchReasonKeys} t={t} />

      {title ? (
        <Link to={`/title/${title.slug}`} className="discover-post-title-link" onClick={onOpen}>
          {title.cover ? (
            <img src={title.cover} alt="" className="discover-post-title-cover" loading="lazy" />
          ) : null}
          <span className="discover-post-title-copy">
            <span className="discover-post-title-label">{t('discover.postLinkedTitle')}</span>
            <strong><SearchHighlightText text={titleLabel} query={query} /></strong>
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      ) : null}

      <div className="discover-post-foot">
        <div className="discover-post-meta">
          {formattedDate ? <span className="discover-post-date">{formattedDate}</span> : null}
          <div className="discover-inline-tags">
            {hasImage ? (
              <span className="discover-inline-tag discover-inline-tag-neutral">
                <ImageIcon size={11} aria-hidden="true" />
                {t('discover.postImageLabel')}
              </span>
            ) : null}
            {title?.type ? (
              <span className="discover-inline-tag">
                {title.type}
              </span>
            ) : null}
          </div>
        </div>

        <div className="discover-post-actions">
          {post.author_username ? (
            <Link to={`/u/${post.author_username}`} className="discover-post-link" onClick={onOpen}>
              {t('discover.openProfile')}
            </Link>
          ) : null}
          <Link to="/feed" className="discover-post-link" onClick={onOpen}>
            {t('discover.openFeed')}
          </Link>
        </div>
      </div>
    </article>
  );
}
