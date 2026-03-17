import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDuplicateCandidates, mapDuplicateCandidate, normalizeDuplicateText } from '../../src/shared/lib/duplicates.js';

test('normalizeDuplicateText strips punctuation and normalizes spacing', () => {
  assert.equal(normalizeDuplicateText(' Solo-Leveling!!! '), 'solo leveling');
});

test('buildDuplicateCandidates scores shared alias and source refs, then suggests a primary title', () => {
  const candidates = buildDuplicateCandidates([
    {
      id: 10,
      slug: 'solo-leveling',
      canonicalTitle: 'Solo Leveling',
      type: 'manhwa',
      subtype: 'manhwa',
      year: 2024,
      originCountry: 'KR',
      popularity: 900,
      aliases: ['Solo Leveling', 'Na Honjaman Level Up'],
      sourceRefs: [{ provider: 'anilist', externalId: '100' }],
    },
    {
      id: 20,
      slug: 'solo-leveling-2024',
      canonicalTitle: 'Na Honjaman Level Up',
      type: 'manhwa',
      subtype: 'manhwa',
      year: 2024,
      originCountry: 'KR',
      popularity: 600,
      aliases: ['Solo Leveling'],
      sourceRefs: [{ provider: 'anilist', externalId: '100' }],
    },
    {
      id: 30,
      slug: 'tower-of-god',
      canonicalTitle: 'Tower of God',
      type: 'manhwa',
      subtype: 'manhwa',
      year: 2020,
      originCountry: 'KR',
      popularity: 850,
      aliases: ['Tower of God'],
      sourceRefs: [{ provider: 'anilist', externalId: '200' }],
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title_a_id, 10);
  assert.equal(candidates[0].title_b_id, 20);
  assert.equal(candidates[0].suggested_primary_title_id, 10);
  assert.equal(candidates[0].status, 'pending');
  assert.ok(candidates[0].confidence >= 70);
  assert.ok(candidates[0].heuristic_flags.includes('shared_alias'));
  assert.ok(candidates[0].heuristic_flags.includes('source_ref_match'));
});

test('mapDuplicateCandidate normalizes nested title records for UI rendering', () => {
  const result = mapDuplicateCandidate({
    id: 7,
    title_a_id: 10,
    title_b_id: 20,
    suggested_primary_title_id: 10,
    confidence: '84',
    status: 'approved',
    reason: 'Shared normalized alias',
    heuristic_flags: ['shared_alias', 'canonical_match'],
    review_note: 'Safe to merge',
    reviewed_by: 'staff-1',
    reviewed_at: '2026-03-15T12:00:00.000Z',
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T11:00:00.000Z',
    title_a: {
      id: 10,
      slug: 'solo-leveling',
      canonical_title: 'Na Honjaman Level Up',
      type: 'manga',
      subtype: 'manhwa',
      release_year: 2024,
      origin_country: 'KR',
      popularity_score: 500,
      cover_image: 'https://example.com/a.jpg',
      aliases: [{ alias: 'Solo Leveling', language_code: 'en', alias_type: 'english', is_primary: true }],
      source_refs: [{ provider: 'anilist', external_id: '100' }],
    },
    title_b: {
      id: 20,
      slug: 'solo-leveling-duplicate',
      canonical_title: 'Solo Leveling',
      type: 'manga',
      subtype: 'manhwa',
      release_year: 2024,
      origin_country: 'KR',
      popularity_score: 400,
      cover_image: 'https://example.com/b.jpg',
      aliases: [],
      source_refs: [],
    },
  });

  assert.equal(result.statusLabel, 'Approved');
  assert.equal(result.confidence, 84);
  assert.equal(result.titleA.type, 'manhwa');
  assert.equal(result.titleA.name, 'Solo Leveling');
  assert.equal(result.titleB.name, 'Solo Leveling');
});
