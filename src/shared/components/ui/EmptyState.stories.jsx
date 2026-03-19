import React from 'react';
import { EmptyState } from './EmptyState';
import '@/app/index.css';

export default {
  title: 'UI/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ minWidth: 320, maxWidth: 480 }}>
        <style>{`
          .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1.5rem; text-align: center; }
          .empty-state .empty-icon { font-size: 3rem; }
          .empty-state h3 { font-size: 1.25rem; font-weight: 700; margin: 0; }
          .empty-state p { color: #6b7280; margin: 0; }
          .btn { display: inline-flex; align-items: center; padding: 0.6rem 1.25rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; background: #fff; }
        `}</style>
        <Story />
      </div>
    ),
  ],
};

export const NoResults = {
  args: {
    icon: '🔍',
    title: 'No results found',
    message: 'Try adjusting your filters or search query.',
  },
};

export const EmptyWatchlist = {
  args: {
    icon: '📚',
    title: 'Your watchlist is empty',
    message: 'Start adding titles to keep track of what you want to watch.',
  },
};

export const NoMatch = {
  args: {
    icon: '✨',
    title: 'No matching titles',
    message: 'Try relaxing your mood or time filters.',
    action: <button className="btn">Clear Filters</button>,
  },
};

export const ErrorState = {
  args: {
    icon: '⚠️',
    title: 'Something went wrong',
    message: 'Failed to load content. Please try again.',
    className: 'empty-state',
  },
};

export const Mobile = {
  args: {
    icon: '🎌',
    title: 'Nothing here yet',
    message: 'Browse the catalog to find titles you love.',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
