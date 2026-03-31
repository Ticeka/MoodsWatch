import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PartyYouTubePlayer } from '../PartyYouTubePlayer.jsx';

describe('PartyYouTubePlayer', () => {
  it('marks the question-phase player as visually hidden without changing its mount', () => {
    const markup = renderToStaticMarkup(
      <PartyYouTubePlayer videoId="abc123video" visualMode="hidden" />,
    );

    expect(markup).toContain('party-yt-player-wrapper');
    expect(markup).toContain('is-visual-hidden');
    expect(markup).toContain('party-yt-player-container');
  });

  it('keeps the reveal player visible by default', () => {
    const markup = renderToStaticMarkup(
      <PartyYouTubePlayer videoId="abc123video" />,
    );

    expect(markup).toContain('party-yt-player-wrapper');
    expect(markup).not.toContain('is-visual-hidden');
  });
});
