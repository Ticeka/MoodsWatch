import { useEffect, useRef, useState } from 'react';
import { buildTitleSearchCandidates, getCachedTitlesSnapshot, isCatalogCacheWarm } from '../lib/recommend';
import { getDisplayTitle } from '../lib/discoverPageUtils';
import { getSearchIntent, scoreSearchCandidates } from '../lib/searchMatch';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';

const MIN_QUERY_LENGTH = 3;
const MIN_SCORE = 18;
const MAX_TITLE_SUGGESTIONS = 3;
const MAX_TOTAL_SUGGESTIONS = 5;
const DEBOUNCE_MS = 120;

export function useRecoverySuggestions({ enabled, query, showAdult }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const normalized = query.trim();

    if (!enabled || normalized.length < MIN_QUERY_LENGTH || !isCatalogCacheWarm()) {
      requestRef.current += 1;
      setSuggestions([]);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const requestId = ++requestRef.current;
    const loadingFrameId = window.requestAnimationFrame(() => {
      if (!cancelled && requestId === requestRef.current) setIsLoading(true);
    });

    const timeoutId = window.setTimeout(() => {
      try {
        const cachedTitles = filterTitlesForAgeGate(getCachedTitlesSnapshot(), showAdult);
        const intent = getSearchIntent(normalized);
        const scoredMatches = cachedTitles
          .map((title) => ({
            title,
            label: getDisplayTitle(title),
            score: scoreSearchCandidates(normalized, buildTitleSearchCandidates(title, intent)),
          }))
          .filter((entry) => (
            entry.label
            && entry.score >= MIN_SCORE
            && entry.label.toLowerCase() !== normalized.toLowerCase()
          ))
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return Number(right.title?.popularity || 0) - Number(left.title?.popularity || 0);
          })
          .slice(0, MAX_TITLE_SUGGESTIONS);

        if (cancelled || requestId !== requestRef.current) return;

        const nextSuggestions = scoredMatches.map((entry) => ({
          query: entry.label,
          slug: entry.title?.slug || '',
          kind: 'title',
        }));

        if (scoredMatches.length > 0) {
          const bestTitle = scoredMatches[0].title;
          const relatedTerms = [
            ...(Array.isArray(bestTitle?.genres) ? bestTitle.genres : []),
            ...(Array.isArray(bestTitle?.moods) ? bestTitle.moods : []),
          ].filter((term) => {
            const normalizedTerm = String(term || '').trim().toLowerCase();
            return (
              normalizedTerm.length >= 3
              && normalizedTerm !== normalized.toLowerCase()
              && !nextSuggestions.some((s) => s.query.toLowerCase() === normalizedTerm)
            );
          });

          for (const term of relatedTerms) {
            if (nextSuggestions.length >= MAX_TOTAL_SUGGESTIONS) break;
            nextSuggestions.push({ query: term, slug: '', kind: 'related' });
          }
        }

        setSuggestions(nextSuggestions);
      } catch {
        if (!cancelled && requestId === requestRef.current) setSuggestions([]);
      } finally {
        if (!cancelled && requestId === requestRef.current) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(loadingFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [enabled, query, showAdult]);

  return { suggestions, isLoading };
}
