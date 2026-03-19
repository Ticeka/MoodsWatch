import React from 'react';
import { SkeletonGrid } from './SkeletonGrid';
import '@/app/index.css';

export default {
  title: 'UI/SkeletonGrid',
  component: SkeletonGrid,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    count: { control: { type: 'range', min: 1, max: 12 } },
    cardClassName: { control: 'text' },
  },
};

export const Default = {
  args: { count: 6 },
  decorators: [
    (Story) => (
      <div style={{ '--grid-cols': 'repeat(auto-fill, minmax(180px, 1fr))', display: 'contents' }}>
        <style>{`
          .loading-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
          .skeleton-card { aspect-ratio: 0.72; border-radius: 1rem; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        `}</style>
        <Story />
      </div>
    ),
  ],
};

export const FourCards = {
  args: { count: 4 },
  decorators: Default.decorators,
};

export const TwoColumns = {
  args: { count: 6 },
  decorators: [
    (Story) => (
      <div>
        <style>{`
          .loading-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
          .skeleton-card { aspect-ratio: 2/3; border-radius: 1.5rem; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        `}</style>
        <Story />
      </div>
    ),
  ],
};
