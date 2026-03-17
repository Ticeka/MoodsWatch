import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildContentReportPayload, mapContentReport } from '../src/shared/lib/contentReports.js';
import { buildDuplicateCandidates, mapDuplicateCandidate, normalizeDuplicateText } from '../src/shared/lib/duplicates.js';

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

check('mapContentReport prefers english alias and resolves related user names', () => {
  const record = {
    id: 12,
    title_id: 300,
    reported_by: 'user-1',
    issue_type: 'broken_link',
    status: 'in_review',
    source_context: 'title_detail',
    description: 'Episode 3 link redirects to a dead page',
    internal_note: 'Waiting for provider update',
    assigned_to: 'staff-1',
    resolved_at: null,
    resolved_by: null,
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T10:30:00.000Z',
    title: {
      id: 300,
      slug: 'solo-leveling',
      canonical_title: 'Na Honjaman Level Up',
      type: 'manga',
      subtype: 'manhwa',
      cover_image: 'https://example.com/cover.jpg',
      aliases: [
        { alias: 'Solo Leveling', language_code: 'en', alias_type: 'english', is_primary: true },
      ],
    },
  };
  const userMap = new Map([
    ['user-1', { id: 'user-1', name: 'Reader One' }],
    ['staff-1', { id: 'staff-1', name: 'Editor Kim' }],
  ]);

  const result = mapContentReport(record, userMap);

  assert.equal(result.issueLabel, 'Broken link');
  assert.equal(result.statusLabel, 'In review');
  assert.equal(result.title.name, 'Solo Leveling');
  assert.equal(result.title.type, 'manhwa');
  assert.equal(result.reporterName, 'Reader One');
  assert.equal(result.assigneeName, 'Editor Kim');
});

check('buildContentReportPayload trims description and preserves null reporter', () => {
  const payload = buildContentReportPayload(
    {
      issueType: 'metadata',
      description: '  Wrong year on the title page  ',
    },
    null,
    88,
    'title_detail'
  );

  assert.deepEqual(payload, {
    title_id: 88,
    reported_by: null,
    issue_type: 'metadata',
    description: 'Wrong year on the title page',
    source_context: 'title_detail',
  });
});

check('normalizeDuplicateText strips punctuation and normalizes spacing', () => {
  assert.equal(normalizeDuplicateText(' Solo-Leveling!!! '), 'solo leveling');
});

check('buildDuplicateCandidates scores shared alias and source refs, then suggests a primary title', () => {
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

check('mapDuplicateCandidate normalizes nested title records for UI rendering', () => {
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

check('phase 3 SQL hardening migration exists with merge safety guards', () => {
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20260316010000_phase3_duplicate_merge_hardening.sql', import.meta.url),
    'utf8'
  );

  assert.match(sql, /Duplicate candidate % not found/);
  assert.match(sql, /must be approved before merge/);
  assert.match(sql, /Candidate % does not match the supplied title ids/);
  assert.match(sql, /where \(source_title_id = p_duplicate_title_id or target_title_id = p_duplicate_title_id\)/);
  assert.match(sql, /title_a_id = least\(/);
  assert.match(sql, /title_b_id = greatest\(/);
});

let passed = 0;

for (const { name, fn } of checks) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`Verified ${passed}/${checks.length} Phase 3 checks`);
}
