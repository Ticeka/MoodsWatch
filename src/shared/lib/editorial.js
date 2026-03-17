export const EDITOR_COLLECTION_SELECT = `
  id,
  slug,
  name,
  description,
  cover_image,
  badge_label,
  collection_type,
  sort_mode,
  status,
  visibility,
  item_limit,
  is_featured,
  starts_at,
  ends_at,
  created_at,
  updated_at,
  items:editor_collection_items(
    id,
    position,
    note,
    title_id,
    title:canonical_titles(
      id,
      slug,
      canonical_title,
      type,
      subtype,
      cover_image,
      avg_score,
      popularity_score,
      aliases:title_aliases(alias, language_code, alias_type, is_primary)
    )
  )
`;

export const HOMEPAGE_BLOCK_SELECT = `
  id,
  block_key,
  title,
  subtitle,
  block_type,
  status,
  visibility,
  position,
  config,
  starts_at,
  ends_at,
  created_at,
  updated_at,
  collection_id,
  collection:editor_collections(id, slug, name, status, visibility)
`;

export const HOMEPAGE_BLOCK_PUBLIC_SELECT = `
  id,
  block_key,
  title,
  subtitle,
  block_type,
  status,
  visibility,
  position,
  config,
  starts_at,
  ends_at,
  collection_id,
  collection:editor_collections(
    id,
    slug,
    name,
    description,
    cover_image,
    badge_label,
    collection_type,
    sort_mode,
    status,
    visibility,
    item_limit,
    is_featured,
    starts_at,
    ends_at,
    items:editor_collection_items(
      id,
      position,
      note,
      title_id,
      title:canonical_titles(
        id,
        slug,
        canonical_title,
        type,
        subtype,
        release_year,
        status,
        episodes,
        chapters,
        cover_image,
        avg_score,
        popularity_score,
        aliases:title_aliases(alias, language_code, alias_type, is_primary)
      )
    )
  )
`;

function getAlias(record, predicate) {
  return record?.aliases?.find(predicate)?.alias || '';
}

function mapCollectionItem(item) {
  const title = item.title || {};
  return {
    id: item.id,
    position: item.position ?? 0,
    note: item.note || '',
    titleId: item.title_id,
    title: {
      id: title.id,
      slug: title.slug,
      name:
        getAlias(title, (alias) => alias.alias_type === 'english' || alias.language_code === 'en') ||
        title.canonical_title ||
        'Untitled',
      type: title.subtype === 'manhwa' ? 'manhwa' : title.type,
      cover: title.cover_image || '',
      score: title.avg_score ?? null,
      popularity: title.popularity_score ?? null,
    },
  };
}

export function mapEditorCollection(record) {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description || '',
    coverImage: record.cover_image || '',
    badgeLabel: record.badge_label || '',
    collectionType: record.collection_type,
    sortMode: record.sort_mode,
    status: record.status,
    visibility: record.visibility,
    itemLimit: record.item_limit ?? 12,
    isFeatured: Boolean(record.is_featured),
    startsAt: record.starts_at || '',
    endsAt: record.ends_at || '',
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    items: (record.items || [])
      .map(mapCollectionItem)
      .sort((a, b) => a.position - b.position),
  };
}

export function mapHomepageBlock(record) {
  return {
    id: record.id,
    blockKey: record.block_key,
    title: record.title,
    subtitle: record.subtitle || '',
    blockType: record.block_type,
    status: record.status,
    visibility: record.visibility,
    position: record.position ?? 0,
    config: record.config || {},
    startsAt: record.starts_at || '',
    endsAt: record.ends_at || '',
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    collectionId: record.collection_id || null,
    collection: record.collection
      ? {
          id: record.collection.id,
          slug: record.collection.slug,
          name: record.collection.name,
          status: record.collection.status,
          visibility: record.collection.visibility,
        }
      : null,
  };
}

export function mapHomepagePublicBlock(record) {
  const block = mapHomepageBlock(record);
  const collection = record.collection ? mapEditorCollection(record.collection) : null;

  return {
    ...block,
    collection,
  };
}

export function buildCollectionPayload(form, userId) {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    cover_image: form.coverImage.trim() || null,
    badge_label: form.badgeLabel.trim() || null,
    collection_type: form.collectionType,
    sort_mode: form.sortMode,
    status: form.status,
    visibility: form.visibility,
    item_limit: Number(form.itemLimit) || 12,
    is_featured: Boolean(form.isFeatured),
    starts_at: form.startsAt || null,
    ends_at: form.endsAt || null,
    updated_by: userId || null,
  };
}

export function buildHomepageBlockPayload(form, userId) {
  return {
    block_key: form.blockKey.trim(),
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    block_type: form.blockType,
    status: form.status,
    visibility: form.visibility,
    position: Number(form.position) || 0,
    collection_id: form.collectionId === '' ? null : Number(form.collectionId),
    config: form.config,
    starts_at: form.startsAt || null,
    ends_at: form.endsAt || null,
    updated_by: userId || null,
  };
}
