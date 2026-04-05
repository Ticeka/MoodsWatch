import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/trailers', () => ({
  normalizeTrailer: () => null,
}), { virtual: true });

import { CANONICAL_TITLE_SEARCH_SELECT } from '../catalog.js';

describe('CANONICAL_TITLE_SEARCH_SELECT', () => {
  it('includes franchise identity fields for franchise-aware search dedupe', () => {
    expect(CANONICAL_TITLE_SEARCH_SELECT).toContain('franchise_id');
    expect(CANONICAL_TITLE_SEARCH_SELECT).toContain('franchise_name');
    expect(CANONICAL_TITLE_SEARCH_SELECT).toContain('franchise_aliases');
    expect(CANONICAL_TITLE_SEARCH_SELECT).toContain('franchises_cache');
  });
});
