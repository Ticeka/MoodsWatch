import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentReportPayload, mapContentReport } from '../../src/shared/lib/contentReports.js';

test('mapContentReport prefers english alias and resolves related user names', () => {
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

test('buildContentReportPayload trims description and preserves null reporter', () => {
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
