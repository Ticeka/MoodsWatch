import { describe, expect, it } from 'vitest';
import { buildContinueCards } from '../homePresentation.js';

describe('buildContinueCards', () => {
  it('builds episode-based continue metadata', () => {
    const [card] = buildContinueCards([{
      id: 'anime-1',
      type: 'anime',
      episodes: 12,
      _listProgressEpisode: 3,
      _targetEpisode: 5,
    }]);

    expect(card._continueUnitLabel).toBe('EP');
    expect(card._continueCurrentProgress).toBe(3);
    expect(card._continueNextUnit).toBe(4);
    expect(card._continueRemaining).toBe(9);
    expect(card._continueTargetUnits).toBe(5);
    expect(card._continueSummary).toBe('EP 3 / 12');
  });

  it('builds chapter-based continue metadata', () => {
    const [card] = buildContinueCards([{
      id: 'manga-1',
      type: 'manga',
      chapters: 40,
      _listProgressChapter: 7,
    }]);

    expect(card._continueUnitLabel).toBe('CH');
    expect(card._continueCurrentProgress).toBe(7);
    expect(card._continueNextUnit).toBe(8);
    expect(card._continueRemaining).toBe(33);
    expect(card._continueTargetUnits).toBeNull();
    expect(card._continueSummary).toBe('CH 7 / 40');
  });
});
