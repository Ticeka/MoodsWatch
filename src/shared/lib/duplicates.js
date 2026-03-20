export const DUPLICATE_CANDIDATE_SELECT = `
  id,
  title_a_id,
  title_b_id,
  suggested_primary_title_id,
  confidence,
  status,
  reason,
  heuristic_flags,
  review_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at,
  title_a:canonical_titles!duplicate_candidates_title_a_id_fkey(
    id,
    slug,
    canonical_title,
    type,
    subtype,
    release_year,
    origin_country,
    popularity_score,
    cover_image,
    aliases:title_aliases(alias, language_code, alias_type, is_primary),
    source_refs:title_source_refs(provider, external_id)
  ),
  title_b:canonical_titles!duplicate_candidates_title_b_id_fkey(
    id,
    slug,
    canonical_title,
    type,
    subtype,
    release_year,
    origin_country,
    popularity_score,
    cover_image,
    aliases:title_aliases(alias, language_code, alias_type, is_primary),
    source_refs:title_source_refs(provider, external_id)
  )
`;

export const DUPLICATE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'merged', label: 'Merged' },
];

function getAlias(record, predicate) {
  return record?.aliases?.find(predicate)?.alias || '';
}

export function getDuplicateStatusLabel(status) {
  return DUPLICATE_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export function normalizeDuplicateText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mapDuplicateTitle(record) {
  return {
    id: record?.id || null,
    slug: record?.slug || '',
    canonicalTitle: record?.canonical_title || '',
    name:
      getAlias(record, (alias) => alias.alias_type === 'english' || alias.language_code === 'en') ||
      record?.canonical_title ||
      'Untitled',
    type: record?.subtype === 'manhwa' ? 'manhwa' : record?.type,
    subtype: record?.subtype || '',
    year: record?.release_year || null,
    originCountry: record?.origin_country || '',
    popularity: record?.popularity_score || 0,
    cover: record?.cover_image || '',
    aliases: (record?.aliases || []).map((alias) => alias.alias).filter(Boolean),
    sourceRefs: (record?.source_refs || []).map((ref) => ({
      provider: ref.provider,
      externalId: ref.external_id,
    })),
  };
}

export function mapDuplicateCandidate(record) {
  const titleA = mapDuplicateTitle(record?.title_a);
  const titleB = mapDuplicateTitle(record?.title_b);

  return {
    id: record.id,
    titleAId: record.title_a_id,
    titleBId: record.title_b_id,
    suggestedPrimaryTitleId: record.suggested_primary_title_id,
    confidence: Number(record.confidence || 0),
    status: record.status,
    statusLabel: getDuplicateStatusLabel(record.status),
    reason: record.reason || '',
    heuristicFlags: Array.isArray(record.heuristic_flags) ? record.heuristic_flags : [],
    reviewNote: record.review_note || '',
    reviewedBy: record.reviewed_by || null,
    reviewedAt: record.reviewed_at || null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    titleA,
    titleB,
  };
}

function getTitleKeys(title) {
  const keys = new Set();
  const canonical = normalizeDuplicateText(title.canonicalTitle);
  if (canonical.length >= 4) keys.add(canonical);
  (title.aliases || []).forEach((alias) => {
    const normalized = normalizeDuplicateText(alias);
    if (normalized.length >= 4) keys.add(normalized);
  });
  return [...keys];
}

function choosePrimaryTitleId(a, b) {
  if ((a.popularity || 0) !== (b.popularity || 0)) {
    return (a.popularity || 0) > (b.popularity || 0) ? a.id : b.id;
  }
  return a.id < b.id ? a.id : b.id;
}

function buildPairKey(idA, idB) {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export function buildDuplicateCandidates(titles) {
  const groups = new Map();

  titles.forEach((title) => {
    getTitleKeys(title).forEach((key) => {
      const groupKey = `${title.type}:${key}`;
      const bucket = groups.get(groupKey) || [];
      bucket.push(title);
      groups.set(groupKey, bucket);
    });
  });

  const pairs = new Map();

  groups.forEach((bucket, groupKey) => {
    const [_typeId, key] = groupKey.split(':');
    if (bucket.length < 2 || bucket.length > 12) return;

    for (let index = 0; index < bucket.length; index += 1) {
      for (let inner = index + 1; inner < bucket.length; inner += 1) {
        const a = bucket[index];
        const b = bucket[inner];
        if (a.id === b.id || a.type !== b.type || a.subtype !== b.subtype) continue;

        const pairKey = buildPairKey(a.id, b.id);
        const current = pairs.get(pairKey) || {
          titleAId: Math.min(a.id, b.id),
          titleBId: Math.max(a.id, b.id),
          confidence: 0,
          heuristicFlags: new Set(),
          reasons: new Set(),
          left: a.id < b.id ? a : b,
          right: a.id < b.id ? b : a,
        };

        current.confidence += 35;
        current.heuristicFlags.add('shared_alias');
        current.reasons.add(`Shared normalized alias: "${key}"`);

        const canonicalA = normalizeDuplicateText(a.canonicalTitle);
        const canonicalB = normalizeDuplicateText(b.canonicalTitle);
        if (canonicalA && canonicalA === canonicalB) {
          current.confidence += 20;
          current.heuristicFlags.add('canonical_match');
          current.reasons.add('Canonical titles match');
        }

        if (normalizeDuplicateText(a.slug) === normalizeDuplicateText(b.slug)) {
          current.confidence += 15;
          current.heuristicFlags.add('slug_match');
          current.reasons.add('Slugs match');
        }

        if (a.year && b.year && Math.abs(a.year - b.year) <= 1) {
          current.confidence += 10;
          current.heuristicFlags.add('year_close');
          current.reasons.add('Release year is within 1 year');
        }

        if (a.originCountry && b.originCountry && a.originCountry === b.originCountry) {
          current.confidence += 5;
          current.heuristicFlags.add('origin_match');
          current.reasons.add(`Origin country matches (${a.originCountry})`);
        }

        const sourceOverlap = new Set(a.sourceRefs.map((ref) => `${ref.provider}:${ref.externalId}`));
        const hasSharedSourceRef = b.sourceRefs.some((ref) => sourceOverlap.has(`${ref.provider}:${ref.externalId}`));
        if (hasSharedSourceRef) {
          current.confidence += 30;
          current.heuristicFlags.add('source_ref_match');
          current.reasons.add('At least one provider/external id matches');
        }

        pairs.set(pairKey, current);
      }
    }
  });

  return [...pairs.values()]
    .filter((candidate) => candidate.confidence >= 40)
    .map((candidate) => ({
      title_a_id: candidate.titleAId,
      title_b_id: candidate.titleBId,
      suggested_primary_title_id: choosePrimaryTitleId(candidate.left, candidate.right),
      confidence: Math.min(candidate.confidence, 99),
      heuristic_flags: [...candidate.heuristicFlags],
      reason: [...candidate.reasons].slice(0, 4).join(' • '),
      status: 'pending',
    }))
    .sort((a, b) => b.confidence - a.confidence || a.title_a_id - b.title_a_id);
}
