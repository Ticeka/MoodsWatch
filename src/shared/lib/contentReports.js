export const CONTENT_REPORT_SELECT = `
  id,
  title_id,
  reported_by,
  issue_type,
  status,
  source_context,
  description,
  internal_note,
  assigned_to,
  resolved_at,
  resolved_by,
  created_at,
  updated_at,
  title:canonical_titles(
    id,
    slug,
    canonical_title,
    type,
    subtype,
    cover_image,
    aliases:aliases_cache
  )
`;

export const CONTENT_REPORT_ISSUE_OPTIONS = [
  { value: 'metadata', label: 'Metadata' },
  { value: 'broken_link', label: 'Broken link' },
  { value: 'wrong_cover', label: 'Wrong cover' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'nsfw', label: 'Sensitive / NSFW' },
  { value: 'other', label: 'Other' },
];

export const CONTENT_REPORT_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

function getAlias(record, predicate) {
  return record?.aliases?.find(predicate)?.alias || '';
}

export function getContentReportIssueLabel(issueType) {
  return CONTENT_REPORT_ISSUE_OPTIONS.find((option) => option.value === issueType)?.label || issueType;
}

export function getContentReportStatusLabel(status) {
  return CONTENT_REPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export function mapContentReport(record, userMap = new Map()) {
  const title = record?.title || {};
  const titleName =
    getAlias(title, (alias) => alias.alias_type === 'english' || alias.language_code === 'en') ||
    title.canonical_title ||
    'Untitled';

  return {
    id: record.id,
    titleId: record.title_id,
    reportedBy: record.reported_by || null,
    issueType: record.issue_type,
    issueLabel: getContentReportIssueLabel(record.issue_type),
    status: record.status,
    statusLabel: getContentReportStatusLabel(record.status),
    sourceContext: record.source_context,
    description: record.description || '',
    internalNote: record.internal_note || '',
    assignedTo: record.assigned_to || null,
    resolvedAt: record.resolved_at || null,
    resolvedBy: record.resolved_by || null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    title: {
      id: title.id,
      slug: title.slug,
      name: titleName,
      canonicalTitle: title.canonical_title || '',
      type: title.subtype === 'manhwa' ? 'manhwa' : title.type,
      cover: title.cover_image || '',
    },
    reporterName: userMap.get(record.reported_by)?.name || record.reported_by || 'Anonymous',
    assigneeName: userMap.get(record.assigned_to)?.name || record.assigned_to || '',
    resolverName: userMap.get(record.resolved_by)?.name || record.resolved_by || '',
  };
}

export function buildContentReportPayload(form, userId, titleId, sourceContext = 'title_detail') {
  return {
    title_id: titleId,
    reported_by: userId || null,
    issue_type: form.issueType,
    description: form.description.trim() || null,
    source_context: sourceContext,
  };
}
