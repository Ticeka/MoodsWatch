import React from 'react';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { EntityGridSkeleton } from './EntityGridSkeleton';

export function DiscoverSection({
  title,
  subtitle,
  action,
  isLoading,
  error,
  onRetry,
  hasItems,
  emptyTitle,
  emptyMessage,
  emptyAction,
  children,
  emptyIcon,
  loadingVariant = 'entity',
}) {
  return (
    <section className="discover-result-section">
      <SectionHeader
        title={title}
        subtitle={<p className="discover-section-subtitle">{subtitle}</p>}
        action={action}
        level="h2"
      />
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : isLoading ? (
        loadingVariant === 'titles' ? <SkeletonGrid /> : <EntityGridSkeleton />
      ) : hasItems ? (
        children
      ) : (
        <EmptyState
          className="discover-empty-state"
          icon={emptyIcon}
          title={emptyTitle}
          message={emptyMessage}
          action={emptyAction}
        />
      )}
    </section>
  );
}
