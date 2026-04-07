import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import {
  createAdminTitle,
  fetchAdminTitleMoods,
  fetchAdminTitleRecord,
  saveAdminTitleSourceReference,
  syncAdminTitleRelations,
  updateAdminTitle,
} from '@/features/admin/api';
import {
  buildAliasRows,
  buildCanonicalPayload,
  mapCanonicalRecordToAdminForm,
} from '@/shared/lib/catalog';
import { fetchAniListGraphQL } from '@/shared/lib/anilist';
import { normalizeTrailer } from '@/shared/lib/trailers';
import { isChapterBasedType, isEpisodeBasedType } from '@/shared/lib/titleType';
import toast from 'react-hot-toast';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const PLATFORM_OPTIONS = [
  'Netflix',
  'Bilibili',
  'iQIYI',
  'Crunchyroll',
  'Disney+',
  'YouTube',
  'Ani-One',
  'Muse Thailand',
  'MANGA Plus',
  'WEBTOON',
  'Kakao Webtoon',
  'Tapas',
  'Tappytoon',
  'Lezhin Comics',
  'Comikey',
  'Pocket Comics',
  'Toomics',
  'Viz',
  'Shonen Jump',
  'Line Webtoon',
  'Community Scan',
  'Fan Translation',
  'Mirror Site',
  'Reading Portal',
  'Other',
];

const ADMIN_TITLE_DRAFT_PREFIX = 'moodwatch-admin-title-draft';
const TRAILER_SOURCE_OPTIONS = ['manual', 'anilist', 'tmdb', 'youtube', 'dailymotion'];
const ANILIST_TRAILER_QUERY = `
  query AdminTitleTrailer($id: Int!) {
    Media(id: $id) {
      id
      siteUrl
      title {
        romaji
        english
        native
      }
      trailer {
        id
        site
        thumbnail
      }
    }
  }
`;
const ANILIST_TRAILER_SEARCH_QUERY = `
  query AdminTitleTrailerSearch($search: String!, $type: MediaType) {
    Page(page: 1, perPage: 5) {
      media(search: $search, type: $type, isAdult: false) {
        id
        siteUrl
        title {
          romaji
          english
          native
        }
        trailer {
          id
          site
          thumbnail
        }
      }
    }
  }
`;

function getDraftStorageKey(id, isNew) {
  return `${ADMIN_TITLE_DRAFT_PREFIX}:${isNew ? 'new' : id}`;
}

function loadDraft(storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(storageKey, draft) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Ignore storage failures
  }
}

function clearDraft(storageKey) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures
  }
}

function sortByJsonValue(items = []) {
  return [...items].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function normalizeStringList(value = '') {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function normalizePlatformLinks(platformLinks = []) {
  return sortByJsonValue(
    platformLinks
      .map((item) => ({
        platform_name: String(item.platform_name || '').trim(),
        url: String(item.url || '').trim(),
        region_code: String(item.region_code || '').trim().toUpperCase() || null,
      }))
      .filter((item) => item.platform_name && item.url)
  );
}

function buildRelationSnapshot({ titleId, formData, selectedMoods, genreInput, tagInput, platformLinks }) {
  return {
    aliases: sortByJsonValue(buildAliasRows(titleId, formData).map(({ canonical_title_id: _canonical_title_id, ...item }) => item)),
    moods: [...new Set((selectedMoods || []).map((item) => String(item).trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
    genres: normalizeStringList(genreInput),
    tags: normalizeStringList(tagInput),
    availability: normalizePlatformLinks(platformLinks),
  };
}

function normalizeTitleCandidate(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

function mapDisplayTypeToAniListMediaType(type) {
  return type === 'anime' ? 'ANIME' : 'MANGA';
}

function getMediaDisplayTitle(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || '';
}

function buildTrailerPatch(media) {
  const trailer = normalizeTrailer({
    trailer_url: media?.trailer?.id
      ? media.trailer.site === 'youtube'
        ? `https://www.youtube.com/watch?v=${media.trailer.id}`
        : media.trailer.site === 'dailymotion'
          ? `https://www.dailymotion.com/video/${media.trailer.id}`
          : null
      : null,
    trailer_site: media?.trailer?.site || null,
    trailer_video_id: media?.trailer?.id || null,
    trailer_thumbnail_url: media?.trailer?.thumbnail || null,
    trailer_source: media?.trailer?.id ? 'anilist' : null,
  });

  return {
    trailer_url: trailer?.url || '',
    trailer_site: trailer?.site || '',
    trailer_video_id: trailer?.videoId || '',
    trailer_thumbnail_url: trailer?.thumbnailUrl || '',
    trailer_source: trailer?.source || 'anilist',
  };
}

export function AdminTitleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const { t } = useLanguage();
  const draftStorageKey = getDraftStorageKey(id, isNew);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title_en: '',
    title_romaji: '',
    title_native: '',
    title_th: '',
    slug: '',
    synopsis: '',
    type: 'anime',
    status: 'ongoing',
    release_year: new Date().getFullYear(),
    average_score: '',
    episodes: '',
    chapters: '',
    volumes: '',
    duration_minutes: '',
    cover_image: '',
    banner_image: '',
    trailer_url: '',
    trailer_site: '',
    trailer_video_id: '',
    trailer_thumbnail_url: '',
    trailer_source: '',
    popularity: 0,
    is_adult: false,
    origin_country: '',
    origin_language: '',
  });
  const [availableMoods, setAvailableMoods] = useState([]);
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [genreInput, setGenreInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [platformLinks, setPlatformLinks] = useState([]);
  const [initialRelations, setInitialRelations] = useState(null);
  const [sourceRefs, setSourceRefs] = useState([]);
  const [pendingSourceRef, setPendingSourceRef] = useState(null);
  const [isFetchingTrailer, setIsFetchingTrailer] = useState(false);
  const [trailerFetchState, setTrailerFetchState] = useState({ status: 'idle', message: '' });

  const trailerPreview = useMemo(
    () => normalizeTrailer(formData),
    [
      formData.trailer_source,
      formData.trailer_site,
      formData.trailer_thumbnail_url,
      formData.trailer_url,
      formData.trailer_video_id,
    ]
  );
  const aniListSourceRef = useMemo(
    () => sourceRefs.find((entry) => entry.provider === 'anilist') || null,
    [sourceRefs]
  );

  const fetchTitleDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      setAvailableMoods(await fetchAdminTitleMoods());

      if (isNew) {
        const draft = loadDraft(draftStorageKey);
        if (draft) {
          setFormData((current) => ({ ...current, ...(draft.formData || {}) }));
          setSelectedMoods(draft.selectedMoods || []);
          setGenreInput(draft.genreInput || '');
          setTagInput(draft.tagInput || '');
          setPlatformLinks(draft.platformLinks || []);
        }
        setSourceRefs([]);
        setPendingSourceRef(null);
        setInitialRelations(null);
        return;
      }

      const data = await fetchAdminTitleRecord(id);
      if (!data) return;

      const nextFormData = mapCanonicalRecordToAdminForm(data);
      const nextSelectedMoods = data.moods?.map((item) => item.mood_id) || [];
      const nextGenreInput = data.genres?.map((item) => item.genre_name).join(', ') || '';
      const nextTagInput = data.tags?.map((item) => item.tag_name).join(', ') || '';
      const nextPlatformLinks = data.availability?.map((item) => ({
        platform_name: item.platform_name,
        url: item.url,
        region_code: item.region_code || '',
      })) || [];
      const nextSourceRefs = data.source_refs || [];

      const draft = loadDraft(draftStorageKey);
      const restoredFormData = draft?.formData ? { ...nextFormData, ...draft.formData } : nextFormData;
      const restoredSelectedMoods = draft?.selectedMoods || nextSelectedMoods;
      const restoredGenreInput = draft?.genreInput ?? nextGenreInput;
      const restoredTagInput = draft?.tagInput ?? nextTagInput;
      const restoredPlatformLinks = draft?.platformLinks || nextPlatformLinks;

      setFormData(restoredFormData);
      setSelectedMoods(restoredSelectedMoods);
      setGenreInput(restoredGenreInput);
      setTagInput(restoredTagInput);
      setPlatformLinks(restoredPlatformLinks);
      setSourceRefs(nextSourceRefs);
      setPendingSourceRef(null);
      setInitialRelations(buildRelationSnapshot({
        titleId: id,
        formData: nextFormData,
        selectedMoods: nextSelectedMoods,
        genreInput: nextGenreInput,
        tagInput: nextTagInput,
        platformLinks: nextPlatformLinks,
      }));
    } catch (error) {
      console.error('Error fetching title details:', error);
      toast.error(
        error?.message === 'Supabase client is not available'
          ? t('admin.titleEdit.supabaseUnavailable')
          : t('admin.titleEdit.unableToLoad')
      );
      navigate('/admin/titles');
    } finally {
      setIsLoading(false);
    }
  }, [draftStorageKey, id, isNew, navigate, t]);

  useEffect(() => {
    fetchTitleDetails();
  }, [fetchTitleDetails]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleTrailerFieldChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setTrailerFetchState((current) => (current.status === 'error' ? { status: 'idle', message: '' } : current));
  };

  const toggleMood = (moodId) => {
    setSelectedMoods((prev) => (prev.includes(moodId) ? prev.filter((item) => item !== moodId) : [...prev, moodId]));
  };

  const handleAddPlatform = () => {
    setPlatformLinks((prev) => [...prev, { platform_name: '', url: '', region_code: '' }]);
  };

  const handleRemovePlatform = (index) => {
    setPlatformLinks((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handlePlatformChange = (index, field, value) => {
    setPlatformLinks((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const handleGenerateSlug = () => {
    const base = formData.title_en || formData.title_th || '';
    if (!base) {
      toast.error(t('admin.titleEdit.enterTitleFirst'));
      return;
    }

    const slug = base
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setFormData((prev) => ({ ...prev, slug }));
    toast.success(t('admin.titleEdit.slugGenerated'));
  };

  const handleFetchTrailer = async () => {
    const searchCandidates = [
      formData.title_en,
      formData.title_romaji,
      formData.title_native,
      formData.title_th,
    ].filter(Boolean);
    const searchTitle = searchCandidates[0];

    if (!aniListSourceRef?.external_id && !searchTitle) {
      toast.error(t('admin.titleEdit.trailerNeedsTitle'));
      return;
    }

    setIsFetchingTrailer(true);
    setTrailerFetchState({ status: 'loading', message: t('admin.titleEdit.trailerFetching') });

    try {
      let media = null;

      if (aniListSourceRef?.external_id) {
        const result = await fetchAniListGraphQL(ANILIST_TRAILER_QUERY, {
          id: Number(aniListSourceRef.external_id),
        });
        media = result?.Media || null;
      } else if (searchTitle) {
        const result = await fetchAniListGraphQL(ANILIST_TRAILER_SEARCH_QUERY, {
          search: searchTitle,
          type: mapDisplayTypeToAniListMediaType(formData.type),
        });
        const mediaList = result?.Page?.media || [];
        const normalizedCandidates = new Set(searchCandidates.map(normalizeTitleCandidate));
        const exactWithTrailer = mediaList.find((item) => (
          item?.trailer?.id && normalizedCandidates.has(normalizeTitleCandidate(getMediaDisplayTitle(item)))
        ));
        const trailerCandidate = mediaList.find((item) => item?.trailer?.id);
        const exactCandidate = mediaList.find((item) => normalizedCandidates.has(normalizeTitleCandidate(getMediaDisplayTitle(item))));
        media = exactWithTrailer || trailerCandidate || exactCandidate || mediaList[0] || null;
      }

      if (!media) {
        throw new Error(t('admin.titleEdit.trailerNoMatch'));
      }

      if (!media?.trailer?.id) {
        throw new Error(t('admin.titleEdit.trailerNoResult'));
      }

      setFormData((prev) => ({
        ...prev,
        ...buildTrailerPatch(media),
      }));

      const nextRef = {
        provider: 'anilist',
        external_id: String(media.id),
        external_url: media.siteUrl || null,
        source_priority: formData.type === 'anime' ? 10 : 20,
        raw_payload: media,
      };
      setPendingSourceRef(nextRef);
      setSourceRefs((current) => {
        const withoutAniList = current.filter((entry) => entry.provider !== 'anilist');
        return [...withoutAniList, nextRef];
      });
      setTrailerFetchState({
        status: 'success',
        message: t('admin.titleEdit.trailerFetched', { title: getMediaDisplayTitle(media) }),
      });
    } catch (error) {
      console.error('Failed to fetch AniList trailer:', error);
      setTrailerFetchState({
        status: 'error',
        message: error.message || t('admin.titleEdit.trailerFetchFailed'),
      });
    } finally {
      setIsFetchingTrailer(false);
    }
  };

  const handleClearTrailer = () => {
    setFormData((prev) => ({
      ...prev,
      trailer_url: '',
      trailer_site: '',
      trailer_video_id: '',
      trailer_thumbnail_url: '',
      trailer_source: '',
    }));
    setTrailerFetchState({ status: 'idle', message: '' });
  };

  const handleSave = async (event) => {
    event?.preventDefault();

    if (!formData.title_en || !formData.slug) {
      toast.error(t('admin.titleEdit.titleSlugRequired'));
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(isNew ? t('admin.titleEdit.creating') : t('admin.titleEdit.savingTitle'));

    try {
      const payload = buildCanonicalPayload(formData);
      let titleId = id;

      if (isNew) {
        const inserted = await createAdminTitle(payload);
        titleId = inserted.id;
      } else {
        await updateAdminTitle(id, payload);
      }

      if (pendingSourceRef?.external_id) {
        await saveAdminTitleSourceReference(titleId, pendingSourceRef);
        setPendingSourceRef(null);
      }

      const nextRelations = buildRelationSnapshot({
        titleId,
        formData,
        selectedMoods,
        genreInput,
        tagInput,
        platformLinks,
      });
      await syncAdminTitleRelations(titleId, nextRelations, initialRelations);
      setInitialRelations(nextRelations);
      clearDraft(draftStorageKey);

      toast.success(isNew ? t('admin.titleEdit.titleCreated') : t('admin.titleEdit.titleUpdated'), { id: toastId });
      navigate('/admin/titles');
    } catch (error) {
      console.error('Error saving title:', error);
      toast.error(
        error?.message === 'Supabase client is not available'
          ? t('admin.titleEdit.supabaseUnavailable')
          : (error.message || t('admin.titleEdit.saveFailed')),
        { id: toastId }
      );
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    saveDraft(draftStorageKey, {
      formData,
      selectedMoods,
      genreInput,
      tagInput,
      platformLinks,
      updatedAt: new Date().toISOString(),
    });
  }, [draftStorageKey, formData, genreInput, isLoading, platformLinks, selectedMoods, tagInput]);

  if (isLoading) {
    return <div className="admin-page-content" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>{t('admin.common.loading')}</div>;
  }

  return (
    <div className="admin-page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-4)' }}>
        <button
          onClick={() => navigate('/admin/titles')}
          className="action-btn"
          style={{ padding: 'var(--space-1) var(--space-3)', flexShrink: 0 }}
          type="button"
        >
          {t('admin.titleEdit.backToTitles')}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {isNew ? t('admin.titleEdit.createTitle') : t('admin.titleEdit.editTitle')}
          </h1>
          {!isNew && <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '2px 0 0' }}>{t('admin.titleEdit.catalogId', { id })}</p>}
        </div>
      </div>

      <form onSubmit={handleSave} className="admin-form-container">
        <div className="admin-edit-section">
          <h2>{t('admin.titleEdit.basicMetadata')}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div>
              <label className="form-label">{t('admin.titleEdit.titleEn')}</label>
              <input type="text" className="form-input" name="title_en" value={formData.title_en} onChange={handleInputChange} required />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.titleRomaji')}</label>
              <input type="text" className="form-input" name="title_romaji" value={formData.title_romaji} onChange={handleInputChange} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.titleNative')}</label>
              <input type="text" className="form-input" name="title_native" value={formData.title_native} onChange={handleInputChange} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.titleTh')}</label>
              <input type="text" className="form-input" name="title_th" value={formData.title_th} onChange={handleInputChange} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                {t('admin.titleEdit.slug')}
                <button type="button" onClick={handleGenerateSlug} style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontSize: '0.8rem' }}>
                  {t('admin.titleEdit.generate')}
                </button>
              </label>
              <input type="text" className="form-input" name="slug" value={formData.slug} onChange={handleInputChange} required />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('admin.titleEdit.synopsis')}</label>
              <textarea className="form-input" name="synopsis" value={formData.synopsis} onChange={handleInputChange} rows="5" />
            </div>
          </div>
        </div>

        <div className="admin-edit-section">
          <h2>{t('admin.titleEdit.discoveryMapping')}</h2>

          <div style={{ marginBottom: 'var(--space-6)' }}>
            <label className="form-label">{t('admin.titleEdit.moods')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {availableMoods.map((mood) => (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => toggleMood(mood.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: selectedMoods.includes(mood.id) ? mood.color || 'var(--primary-500)' : 'var(--border-default)',
                    backgroundColor: selectedMoods.includes(mood.id) ? `${mood.color || 'var(--primary-500)'}22` : 'transparent',
                    color: selectedMoods.includes(mood.id) ? mood.color || 'var(--primary-600)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: selectedMoods.includes(mood.id) ? 600 : 400,
                  }}
                >
                  {mood.icon} {mood.name_th}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div>
              <label className="form-label">{t('admin.titleEdit.genres')}</label>
              <input className="form-input" value={genreInput} onChange={(event) => setGenreInput(event.target.value)} placeholder={t('admin.titleEdit.genrePlaceholder')} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.tags')}</label>
              <input className="form-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder={t('admin.titleEdit.tagPlaceholder')} />
            </div>
          </div>
        </div>

        <div className="admin-edit-section">
          <h2>{t('admin.titleEdit.availability')}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {platformLinks.map((platform, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <select
                  className="form-select"
                  style={{ width: '180px' }}
                  value={platform.platform_name}
                  onChange={(event) => handlePlatformChange(idx, 'platform_name', event.target.value)}
                >
                  <option value="">{t('admin.titleEdit.selectPlatform')}</option>
                  {PLATFORM_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <input
                  className="form-input"
                  placeholder={t('admin.titleEdit.officialUrl')}
                  value={platform.url}
                  onChange={(event) => handlePlatformChange(idx, 'url', event.target.value)}
                />
                <input
                  className="form-input"
                  style={{ maxWidth: '120px' }}
                  placeholder={t('admin.titleEdit.region')}
                  value={platform.region_code || ''}
                  onChange={(event) => handlePlatformChange(idx, 'region_code', event.target.value.toUpperCase())}
                />
                <button type="button" className="action-btn" style={{ color: 'var(--error)' }} onClick={() => handleRemovePlatform(idx)}>
                  {t('admin.common.remove')}
                </button>
              </div>
            ))}
            <button type="button" className="action-btn" style={{ width: 'fit-content' }} onClick={handleAddPlatform}>
              {t('admin.titleEdit.addLink')}
            </button>
          </div>
        </div>

        <div className="admin-edit-section">
          <h2>{t('admin.titleEdit.catalogFields')}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
            <div>
              <label className="form-label">{t('admin.titleEdit.type')}</label>
              <select className="form-select" name="type" value={formData.type} onChange={handleInputChange} required>
                <option value="anime">{t('admin.titleEdit.typeAnime')}</option>
                <option value="manga">{t('admin.titleEdit.typeManga')}</option>
                <option value="manhwa">{t('admin.titleEdit.typeManhwa')}</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.status')}</label>
              <select className="form-select" name="status" value={formData.status} onChange={handleInputChange}>
                <option value="ongoing">{t('admin.titleEdit.statusOngoing')}</option>
                <option value="completed">{t('admin.titleEdit.statusCompleted')}</option>
                <option value="upcoming">{t('admin.titleEdit.statusUpcoming')}</option>
                <option value="hiatus">{t('admin.titleEdit.statusHiatus')}</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.releaseYear')}</label>
              <input type="number" className="form-input" name="release_year" value={formData.release_year} onChange={handleInputChange} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.avgScore')}</label>
              <input type="number" className="form-input" name="average_score" value={formData.average_score} onChange={handleInputChange} min="0" max="100" />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.episodes')}</label>
              <input type="number" className="form-input" name="episodes" value={formData.episodes} onChange={handleInputChange} disabled={!isEpisodeBasedType(formData.type)} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.duration')}</label>
              <input type="number" className="form-input" name="duration_minutes" value={formData.duration_minutes} onChange={handleInputChange} disabled={!isEpisodeBasedType(formData.type)} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.chapters')}</label>
              <input type="number" className="form-input" name="chapters" value={formData.chapters} onChange={handleInputChange} disabled={!isChapterBasedType(formData.type)} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.volumes')}</label>
              <input type="number" className="form-input" name="volumes" value={formData.volumes} onChange={handleInputChange} disabled={!isChapterBasedType(formData.type)} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.popularity')}</label>
              <input type="number" className="form-input" name="popularity" value={formData.popularity} onChange={handleInputChange} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.originCountry')}</label>
              <input type="text" className="form-input" name="origin_country" value={formData.origin_country} onChange={handleInputChange} placeholder={t('admin.titleEdit.originCountryPlaceholder')} />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.originLanguage')}</label>
              <input type="text" className="form-input" name="origin_language" value={formData.origin_language} onChange={handleInputChange} placeholder={t('admin.titleEdit.originLanguagePlaceholder')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--error)', fontWeight: 600 }}>
                <input type="checkbox" name="is_adult" checked={formData.is_adult} onChange={handleInputChange} />
                {t('admin.titleEdit.isAdult')}
              </label>
            </div>
          </div>
        </div>

        <div className="admin-edit-section">
          <h2>{t('admin.titleEdit.artwork')}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div>
              <label className="form-label">{t('admin.titleEdit.coverUrl')}</label>
              <input type="text" className="form-input" name="cover_image" value={formData.cover_image} onChange={handleInputChange} />
              {formData.cover_image && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <img src={formData.cover_image} alt={t('admin.titleEdit.previewAlt')} style={{ width: '120px', borderRadius: '8px' }} />
                </div>
              )}
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.bannerUrl')}</label>
              <input type="text" className="form-input" name="banner_image" value={formData.banner_image} onChange={handleInputChange} />
              {formData.banner_image && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <img src={formData.banner_image} alt={t('admin.titleEdit.previewAlt')} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px' }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="admin-edit-section">
          <div className="admin-section-header admin-section-header--tight">
            <div>
              <h2>{t('admin.titleEdit.trailerSection')}</h2>
              <p className="admin-helper-text">{t('admin.titleEdit.trailerHint')}</p>
            </div>
            <div className="admin-inline-actions">
              <button
                type="button"
                className="action-btn"
                onClick={handleFetchTrailer}
                disabled={isFetchingTrailer || isSaving}
              >
                {isFetchingTrailer ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {t('admin.titleEdit.fetchTrailer')}
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={handleClearTrailer}
                disabled={isSaving || (!formData.trailer_url && !formData.trailer_video_id)}
              >
                {t('admin.titleEdit.clearTrailer')}
              </button>
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-grid-wide">
              <label className="form-label">{t('admin.titleEdit.trailerUrl')}</label>
              <input
                type="text"
                className="form-input"
                name="trailer_url"
                value={formData.trailer_url}
                onChange={(event) => handleTrailerFieldChange('trailer_url', event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="admin-helper-text">{t('admin.titleEdit.trailerUrlHint')}</p>
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.trailerSite')}</label>
              <input
                type="text"
                className="form-input"
                name="trailer_site"
                value={formData.trailer_site}
                onChange={(event) => handleTrailerFieldChange('trailer_site', event.target.value)}
                placeholder="youtube"
              />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.trailerVideoId')}</label>
              <input
                type="text"
                className="form-input"
                name="trailer_video_id"
                value={formData.trailer_video_id}
                onChange={(event) => handleTrailerFieldChange('trailer_video_id', event.target.value)}
                placeholder="OhNwckCLzis"
              />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.trailerThumbnail')}</label>
              <input
                type="text"
                className="form-input"
                name="trailer_thumbnail_url"
                value={formData.trailer_thumbnail_url}
                onChange={(event) => handleTrailerFieldChange('trailer_thumbnail_url', event.target.value)}
                placeholder="https://i.ytimg.com/vi/..."
              />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.trailerSource')}</label>
              <select
                className="form-select"
                name="trailer_source"
                value={formData.trailer_source}
                onChange={(event) => handleTrailerFieldChange('trailer_source', event.target.value)}
              >
                <option value="">{t('admin.titleEdit.trailerSourceAuto')}</option>
                {TRAILER_SOURCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-inline-kv-grid admin-inline-kv-grid-wide" style={{ marginTop: 'var(--space-4)' }}>
            <div>
              <span>{t('admin.titleEdit.trailerLinkedSource')}</span>
              <strong>
                {aniListSourceRef?.external_id
                  ? `AniList #${aniListSourceRef.external_id}`
                  : t('admin.titleEdit.trailerNoSourceRef')}
              </strong>
            </div>
            <div>
              <span>{t('admin.titleEdit.trailerStatus')}</span>
              <strong>
                {trailerPreview?.watchUrl
                  ? t('admin.titleEdit.trailerReady')
                  : t('admin.titleEdit.trailerEmpty')}
              </strong>
            </div>
          </div>

          {trailerFetchState.status !== 'idle' && (
            <div className={`admin-inline-alert admin-inline-alert--${trailerFetchState.status}`}>
              {trailerFetchState.status === 'success' ? <CheckCircle2 size={16} /> : null}
              {trailerFetchState.status === 'error' ? <AlertCircle size={16} /> : null}
              {trailerFetchState.status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : null}
              <span>{trailerFetchState.message}</span>
            </div>
          )}

          {trailerPreview ? (
            <div className="admin-trailer-preview">
              <div className="admin-trailer-preview-media">
                {trailerPreview.thumbnailUrl ? (
                  <img
                    src={trailerPreview.thumbnailUrl}
                    alt={t('admin.titleEdit.trailerPreviewAlt')}
                    className="admin-trailer-thumb"
                  />
                ) : (
                  <div className="admin-trailer-thumb admin-trailer-thumb--empty">
                    <PlayCircle size={28} />
                  </div>
                )}
              </div>
              <div className="admin-trailer-preview-copy">
                <span className="admin-section-label">{t('admin.titleEdit.trailerPreview')}</span>
                <h3>{formData.title_en || formData.title_romaji || t('admin.titleEdit.trailerUntitled')}</h3>
                <p className="admin-helper-text">
                  {trailerPreview.provider
                    ? t('admin.titleEdit.trailerProviderLabel', { provider: trailerPreview.provider })
                    : t('admin.titleEdit.trailerNoProvider')}
                </p>
                <div className="admin-preview-meta">
                  {trailerPreview.site ? <span>{t('admin.titleEdit.trailerSiteMeta', { site: trailerPreview.site })}</span> : null}
                  {trailerPreview.videoId ? <span>{t('admin.titleEdit.trailerVideoMeta', { id: trailerPreview.videoId })}</span> : null}
                  {trailerPreview.source ? <span>{t('admin.titleEdit.trailerSourceMeta', { source: trailerPreview.source })}</span> : null}
                </div>
                {trailerPreview.watchUrl ? (
                  <a
                    href={trailerPreview.watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="primary-btn"
                    style={{ width: 'fit-content' }}
                  >
                    <ExternalLink size={14} />
                    {t('admin.titleEdit.openTrailer')}
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="admin-empty-state" style={{ marginTop: 'var(--space-4)' }}>
              <PlayCircle size={22} style={{ color: 'var(--text-tertiary)' }} />
              <span className="admin-state-title">{t('admin.titleEdit.trailerEmptyTitle')}</span>
              <p className="admin-state-description">{t('admin.titleEdit.trailerEmptyHint')}</p>
            </div>
          )}
        </div>

        <div className="admin-sticky-bar">
          <span className="admin-sticky-bar-info">
            {!isNew && t('admin.titleEdit.catalogId', { id })}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="action-btn" onClick={() => navigate('/admin/titles')} type="button">
              {t('admin.common.cancel')}
            </button>
            <button className="primary-btn" onClick={handleSave} disabled={isSaving} type="submit">
              {isSaving ? t('admin.common.saving') : t('admin.common.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default AdminTitleEdit;
