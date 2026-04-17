import React from 'react';
import { Info, ListOrdered, MessageCircle, Search, UserRound } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { DiscoverSection } from '../DiscoverSection';
import { DiscoverTitleCard } from '../DiscoverTitleCard';
import { DiscoverPostCard } from '../DiscoverPostCard';
import { DiscoverProfileCard } from '../DiscoverProfileCard';
import { DiscoverTierlistCard } from '../DiscoverTierlistCard';

function TitlesGrid({ titles, query, onResultClick }) {
  return (
    <div className="dv2-title-grid stagger-children">
      {titles.map((title, index) => (
        <DiscoverTitleCard
          key={title.id}
          title={title}
          query={query}
          onOpen={() => onResultClick('titles', title, index + 1)}
        />
      ))}
    </div>
  );
}

function PostsGrid({ posts, query, locale, t, onResultClick }) {
  return (
    <div className="dv2-entity-grid dv2-post-grid">
      {posts.map((post, index) => (
        <DiscoverPostCard
          key={post.id}
          post={post}
          locale={locale}
          t={t}
          query={query}
          onOpen={() => onResultClick('posts', post, index + 1)}
        />
      ))}
    </div>
  );
}

function ProfilesGrid({ profiles, query, locale, t, onResultClick }) {
  return (
    <div className="dv2-entity-grid">
      {profiles.map((profile, index) => (
        <DiscoverProfileCard
          key={profile.id}
          profile={profile}
          locale={locale}
          t={t}
          query={query}
          onOpen={() => onResultClick('people', profile, index + 1)}
        />
      ))}
    </div>
  );
}

function TierlistsGrid({ tierlists, query, locale, t, onResultClick }) {
  return (
    <div className="dv2-entity-grid">
      {tierlists.map((item, index) => (
        <DiscoverTierlistCard
          key={`${item.kind}-${item.id}`}
          item={item}
          locale={locale}
          t={t}
          query={query}
          onOpen={() => onResultClick('tierlists', item, index + 1)}
        />
      ))}
    </div>
  );
}

function CrossLaneBanner({ query, lanes }) {
  const { t } = useLanguage();
  return (
    <div className="dv2-cross-lane">
      <Info size={14} aria-hidden="true" />
      <span>{t('discover.crossLaneTitlesMissed', { query, lanes })}</span>
    </div>
  );
}

function TitlesPagination({ page, totalPages, onPageChange }) {
  const { t } = useLanguage();

  return (
    <div className="dv2-pagination">
      <Button
        onClick={() => onPageChange(page - 1)}
        variant="primary"
        size="sm"
        disabled={page <= 1}
        type="button"
      >
        {t('common.previous')}
      </Button>
      <span className="dv2-pagination-indicator">
        {t('discover.pageIndicator', { page, total: totalPages })}
      </span>
      <Button
        onClick={() => onPageChange(page + 1)}
        variant="primary"
        size="sm"
        disabled={page >= totalPages}
        type="button"
      >
        {t('common.next')}
      </Button>
    </div>
  );
}

export function DiscoverResults({
  scope,
  query,
  locale,
  titles,
  titleTotal,
  posts,
  profiles,
  tierlists,
  loading,
  error,
  noResultsEverywhere,
  crossLaneFallback,
  emptyAction,
  onRetry,
  onResultClick,
  onScopeChange,
  pagination,
}) {
  const { t } = useLanguage();

  const makeSectionAction = (nextScope, labelKey) => (
    scope === 'all' ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="dv2-section-action"
        onClick={() => onScopeChange(nextScope)}
      >
        {t(labelKey)}
      </Button>
    ) : null
  );

  const isAllScope = scope === 'all';

  if (isAllScope && noResultsEverywhere) {
    return (
      <EmptyState
        className="dv2-empty-state dv2-empty-state--large"
        icon={<Search size={28} />}
        title={t('discover.noResults')}
        message={t('discover.noResultsHint')}
        action={emptyAction}
      />
    );
  }

  if (isAllScope) {
    return (
      <div className="dv2-results-stack">
        {crossLaneFallback ? <CrossLaneBanner query={query.trim()} lanes={crossLaneFallback} /> : null}

        <DiscoverSection
          title={t('discover.titlesSectionTitle')}
          subtitle={t('discover.titlesSectionSubtitle', { count: titleTotal })}
          action={makeSectionAction('titles', 'discover.viewAllTitles')}
          isLoading={loading.titles}
          error={error.titles}
          onRetry={onRetry}
          hasItems={titles.length > 0}
          emptyTitle={t('discover.noResults')}
          emptyMessage={t('discover.noResultsHint')}
          emptyAction={emptyAction}
          emptyIcon={<Search size={24} />}
          loadingVariant="titles"
        >
          <TitlesGrid titles={titles} query={query} onResultClick={onResultClick} />
        </DiscoverSection>

        <DiscoverSection
          title={t('discover.postsSectionTitle')}
          subtitle={t('discover.postsSectionSubtitle', { count: posts.length })}
          action={makeSectionAction('posts', 'discover.viewAllPosts')}
          isLoading={loading.posts}
          error={error.posts}
          onRetry={onRetry}
          hasItems={posts.length > 0}
          emptyTitle={t('discover.postsEmptyTitle')}
          emptyMessage={t('discover.postsEmptyHint')}
          emptyAction={emptyAction}
          emptyIcon={<MessageCircle size={24} />}
        >
          <PostsGrid posts={posts} query={query} locale={locale} t={t} onResultClick={onResultClick} />
        </DiscoverSection>

        <DiscoverSection
          title={t('discover.peopleSectionTitle')}
          subtitle={t('discover.peopleSectionSubtitle', { count: profiles.length })}
          action={makeSectionAction('people', 'discover.viewAllPeople')}
          isLoading={loading.people}
          error={error.people}
          onRetry={onRetry}
          hasItems={profiles.length > 0}
          emptyTitle={t('discover.peopleEmptyTitle')}
          emptyMessage={t('discover.peopleEmptyHint')}
          emptyAction={emptyAction}
          emptyIcon={<UserRound size={24} />}
        >
          <ProfilesGrid profiles={profiles} query={query} locale={locale} t={t} onResultClick={onResultClick} />
        </DiscoverSection>

        <DiscoverSection
          title={t('discover.tierlistsSectionTitle')}
          subtitle={t('discover.tierlistsSectionSubtitle', { count: tierlists.length })}
          action={makeSectionAction('tierlists', 'discover.viewAllTierlists')}
          isLoading={loading.tierlists}
          error={error.tierlists}
          onRetry={onRetry}
          hasItems={tierlists.length > 0}
          emptyTitle={t('discover.tierlistsEmptyTitle')}
          emptyMessage={t('discover.tierlistsEmptyHint')}
          emptyAction={emptyAction}
          emptyIcon={<ListOrdered size={24} />}
        >
          <TierlistsGrid tierlists={tierlists} query={query} locale={locale} t={t} onResultClick={onResultClick} />
        </DiscoverSection>
      </div>
    );
  }

  if (scope === 'titles') {
    if (error.titles) return <ErrorState message={error.titles} onRetry={onRetry} />;
    if (loading.titles) return <SkeletonGrid />;

    if (titles.length === 0) {
      return (
        <EmptyState
          className="dv2-empty-state"
          icon={<Search size={24} />}
          title={t('discover.noResults')}
          message={t('discover.noResultsHint')}
          action={emptyAction}
        />
      );
    }

    return (
      <>
        <TitlesGrid titles={titles} query={query} onResultClick={onResultClick} />
        {pagination ? (
          <TitlesPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={pagination.onChange}
          />
        ) : null}
      </>
    );
  }

  if (scope === 'posts') {
    return (
      <DiscoverSection
        title={t('discover.postsSectionTitle')}
        subtitle={t('discover.postsSectionSubtitle', { count: posts.length })}
        isLoading={loading.posts}
        error={error.posts}
        onRetry={onRetry}
        hasItems={posts.length > 0}
        emptyTitle={t('discover.postsEmptyTitle')}
        emptyMessage={t('discover.postsEmptyHint')}
        emptyAction={emptyAction}
        emptyIcon={<MessageCircle size={24} />}
      >
        <PostsGrid posts={posts} query={query} locale={locale} t={t} onResultClick={onResultClick} />
      </DiscoverSection>
    );
  }

  if (scope === 'people') {
    return (
      <DiscoverSection
        title={t('discover.peopleSectionTitle')}
        subtitle={t('discover.peopleSectionSubtitle', { count: profiles.length })}
        isLoading={loading.people}
        error={error.people}
        onRetry={onRetry}
        hasItems={profiles.length > 0}
        emptyTitle={t('discover.peopleEmptyTitle')}
        emptyMessage={t('discover.peopleEmptyHint')}
        emptyAction={emptyAction}
        emptyIcon={<UserRound size={24} />}
      >
        <ProfilesGrid profiles={profiles} query={query} locale={locale} t={t} onResultClick={onResultClick} />
      </DiscoverSection>
    );
  }

  if (scope === 'tierlists') {
    return (
      <DiscoverSection
        title={t('discover.tierlistsSectionTitle')}
        subtitle={t('discover.tierlistsSectionSubtitle', { count: tierlists.length })}
        isLoading={loading.tierlists}
        error={error.tierlists}
        onRetry={onRetry}
        hasItems={tierlists.length > 0}
        emptyTitle={t('discover.tierlistsEmptyTitle')}
        emptyMessage={t('discover.tierlistsEmptyHint')}
        emptyAction={emptyAction}
        emptyIcon={<ListOrdered size={24} />}
      >
        <TierlistsGrid tierlists={tierlists} query={query} locale={locale} t={t} onResultClick={onResultClick} />
      </DiscoverSection>
    );
  }

  return null;
}
