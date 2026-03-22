import React from 'react';
import { buildSearchPattern, getSearchTerms } from '@/features/discover/lib/searchMatch';

export function SearchHighlightText({ text = '', query = '', className = 'discover-search-highlight' }) {
  const content = String(text || '');
  const terms = getSearchTerms(query);
  const pattern = buildSearchPattern(query);

  if (!content || terms.length === 0 || !pattern) {
    return content;
  }
  const parts = content.split(pattern);

  return parts.map((part, index) => (
    terms.some((term) => {
      const matcher = new RegExp(`^${term.pattern}$`, 'i');
      return matcher.test(part);
    })
      ? <mark key={`${part}-${index}`} className={className}>{part}</mark>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ));
}
