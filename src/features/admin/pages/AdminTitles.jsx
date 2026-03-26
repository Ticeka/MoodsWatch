import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { CANONICAL_TITLE_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import { supabase } from '@/shared/lib/supabase';
import { getTitleTypeMeta } from '@/shared/lib/titleType';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const PAGE_SIZE = 10;
const EXPORT_BATCH_SIZE = 500;
const EXPORT_TITLE_SELECT = `
  id,
  slug,
  canonical_title,
  type,
  subtype,
  aliases:title_aliases(alias, language_code, alias_type, is_primary)
`;

function getAdminPrimaryTitle(record) {
  const englishAlias = record.aliases?.find((alias) => alias.alias_type === 'english' || alias.language_code === 'en')?.alias;
  const thaiAlias = record.aliases?.find((alias) => alias.language_code === 'th')?.alias;
  return englishAlias || thaiAlias || record.canonical_title || record.slug || `#${record.id}`;
}

function buildExportFilters(filters, exportType) {
  switch (exportType) {
    case 'anime':
      return { ...filters, type: 'anime', subtype: 'anime' };
    case 'manga':
      return { ...filters, type: 'manga', subtype: 'manga' };
    case 'manhwa':
      return { ...filters, type: 'manga', subtype: 'manhwa' };
    default:
      return filters;
  }
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function applyCatalogFilters(query, filters) {
  let nextQuery = query;

  if (filters.type !== 'all') {
    nextQuery = nextQuery.eq('type', filters.type);
  }

  if (filters.subtype !== 'all') {
    nextQuery = nextQuery.eq('subtype', filters.subtype);
  }

  if (filters.status !== 'all') {
    nextQuery = nextQuery.eq('status', filters.status);
  }

  if (filters.originCountry !== 'all') {
    nextQuery = nextQuery.eq('origin_country', filters.originCountry);
  }

  if (filters.isAdult !== 'all') {
    nextQuery = nextQuery.eq('is_adult', filters.isAdult === 'true');
  }

  if (filters.yearFrom !== '') {
    nextQuery = nextQuery.gte('release_year', Number(filters.yearFrom));
  }

  if (filters.yearTo !== '') {
    nextQuery = nextQuery.lte('release_year', Number(filters.yearTo));
  }

  if (filters.scoreMin !== '') {
    nextQuery = nextQuery.gte('avg_score', Number(filters.scoreMin));
  }

  if (filters.scoreMax !== '') {
    nextQuery = nextQuery.lte('avg_score', Number(filters.scoreMax));
  }

  if (filters.hasTrailer === 'yes') {
    nextQuery = nextQuery.or('trailer_url.not.is.null,trailer_video_id.not.is.null');
  }

  if (filters.hasTrailer === 'no') {
    nextQuery = nextQuery.is('trailer_url', null).is('trailer_video_id', null);
  }

  return nextQuery;
}

function applyCatalogSorting(query, sortBy, sortDirection) {
  const ascending = sortDirection === 'asc';

  switch (sortBy) {
    case 'updated':
      return query.order('updated_at', { ascending, nullsFirst: false }).order('id', { ascending: true });
    case 'popularity':
      return query.order('popularity_score', { ascending, nullsFirst: false }).order('id', { ascending: true });
    case 'score':
      return query.order('avg_score', { ascending, nullsFirst: false }).order('id', { ascending: true });
    case 'title':
      return query.order('canonical_title', { ascending, nullsFirst: false }).order('id', { ascending: true });
    case 'year':
      return query.order('release_year', { ascending, nullsFirst: false }).order('id', { ascending: true });
    case 'recent':
    default:
      return query.order('created_at', { ascending, nullsFirst: false }).order('id', { ascending: true });
  }
}

async function resolveOfficialLinkIds() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('title_availability')
    .select('canonical_title_id')
    .eq('is_official', true);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.canonical_title_id))];
}

async function resolveMatchingIds(searchTerm, filters) {
  if (!supabase) return [];

  const normalized = searchTerm.trim();
  if (!normalized) return [];

  const wildcard = `%${normalized}%`;
  const aliasPromise = supabase
    .from('title_aliases')
    .select('canonical_title_id')
    .ilike('alias', wildcard)
    .limit(200);

  let directQuery = supabase.from('canonical_titles').select('id');
  directQuery = applyCatalogFilters(directQuery, filters);

  const searchClauses = [
    `canonical_title.ilike.${wildcard}`,
    `slug.ilike.${wildcard}`,
  ];

  if (/^\d+$/.test(normalized)) {
    searchClauses.push(`id.eq.${Number(normalized)}`);
  }

  directQuery = directQuery.or(searchClauses.join(',')).limit(200);

  const [aliasRes, directRes] = await Promise.all([aliasPromise, directQuery]);
  if (aliasRes.error) throw aliasRes.error;
  if (directRes.error) throw directRes.error;

  const ids = new Set();
  (aliasRes.data || []).forEach((item) => ids.add(item.canonical_title_id));
  (directRes.data || []).forEach((item) => ids.add(item.id));
  return [...ids];
}

export function AdminTitles() {
  const { t, language } = useLanguage();

  const SUBTYPE_OPTIONS = [
    { value: 'all', label: t('admin.titles.allSubtypes') },
    { value: 'anime', label: t('admin.titles.subtypeAnime') },
    { value: 'manga', label: t('admin.titles.subtypeManga') },
    { value: 'manhwa', label: t('admin.titles.subtypeManhwa') },
    { value: 'manhua', label: t('admin.titles.subtypeManhua') },
    { value: 'webtoon', label: t('admin.titles.subtypeWebtoon') },
  ];

  const STATUS_OPTIONS = [
    { value: 'all', label: t('admin.titles.allStatuses') },
    { value: 'ongoing', label: t('admin.titles.statusOngoing') },
    { value: 'completed', label: t('admin.titles.statusCompleted') },
    { value: 'upcoming', label: t('admin.titles.statusUpcoming') },
    { value: 'hiatus', label: t('admin.titles.statusHiatus') },
    { value: 'cancelled', label: t('admin.titles.statusCancelled') },
  ];

  const SORT_OPTIONS = [
    { value: 'recent', label: t('admin.titles.sortRecent') },
    { value: 'updated', label: t('admin.titles.sortUpdated') },
    { value: 'popularity', label: t('admin.titles.sortPopularity') },
    { value: 'score', label: t('admin.titles.sortScore') },
    { value: 'title', label: t('admin.titles.sortTitle') },
    { value: 'year', label: t('admin.titles.sortYear') },
  ];

  const SORT_DIRECTION_OPTIONS = [
    { value: 'desc', label: t('admin.titles.sortDesc') },
    { value: 'asc', label: t('admin.titles.sortAsc') },
  ];

  const ORIGIN_COUNTRY_OPTIONS = [
    { value: 'all', label: t('admin.titles.allCountries') },
    { value: 'JP', label: t('admin.titles.countryJP') },
    { value: 'KR', label: t('admin.titles.countryKR') },
    { value: 'CN', label: t('admin.titles.countryCN') },
    { value: 'TH', label: t('admin.titles.countryTH') },
    { value: 'US', label: t('admin.titles.countryUS') },
  ];

  const ADULT_OPTIONS = [
    { value: 'all', label: t('admin.titles.allRatings') },
    { value: 'false', label: t('admin.titles.ratingGeneral') },
    { value: 'true', label: t('admin.titles.ratingAdult') },
  ];

  const [titles, setTitles] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingType, setExportingType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    searchTerm: '',
    type: 'all',
    subtype: 'all',
    status: 'all',
    originCountry: 'all',
    isAdult: 'all',
    hasLinks: 'all',
    hasTrailer: 'all',
    yearFrom: '',
    yearTo: '',
    scoreMin: '',
    scoreMax: '',
    sortBy: 'recent',
    sortDirection: 'desc',
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const exportOptions = useMemo(() => ([
    { id: 'anime', label: t('admin.titles.exportAnime') },
    { id: 'manga', label: t('admin.titles.exportManga') },
    { id: 'manhwa', label: t('admin.titles.exportManhwa') },
  ]), [t]);

  const fetchTitles = useCallback(async () => {
    if (!supabase) {
      toast.error(t('admin.titles.supabaseUnavailable'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const searchTerm = filters.searchTerm.trim();

      // Pre-fetch IDs with official links when the hasLinks filter is active
      let linkIds = null;
      if (filters.hasLinks !== 'all') {
        linkIds = await resolveOfficialLinkIds();
        if (filters.hasLinks === 'yes' && linkIds.length === 0) {
          setTitles([]);
          setTotalCount(0);
          setIsLoading(false);
          return;
        }
      }

      const applyLinkFilter = (query) => {
        if (linkIds === null) return query;
        if (filters.hasLinks === 'yes') {
          return query.in('id', linkIds);
        }
        // hasLinks === 'no'
        if (linkIds.length === 0) return query;
        return query.not('id', 'in', `(${linkIds.join(',')})`);
      };

      let data;
      let count = 0;

      if (searchTerm) {
        let matchingIds = await resolveMatchingIds(searchTerm, filters);

        // Intersect / exclude based on link filter
        if (linkIds !== null) {
          const linkSet = new Set(linkIds);
          if (filters.hasLinks === 'yes') {
            matchingIds = matchingIds.filter((id) => linkSet.has(id));
          } else {
            matchingIds = matchingIds.filter((id) => !linkSet.has(id));
          }
        }

        if (matchingIds.length === 0) {
          setTitles([]);
          setTotalCount(0);
          setIsLoading(false);
          return;
        }

        let query = supabase
          .from('canonical_titles')
          .select(CANONICAL_TITLE_SELECT, { count: 'exact' })
          .in('id', matchingIds);

        query = applyCatalogFilters(query, filters);
        query = applyCatalogSorting(query, filters.sortBy, filters.sortDirection);

        const response = await query.range(from, to);
        if (response.error) throw response.error;
        data = response.data;
        count = response.count || 0;
      } else {
        let query = supabase
          .from('canonical_titles')
          .select(CANONICAL_TITLE_SELECT, { count: 'exact' });

        query = applyCatalogFilters(query, filters);
        query = applyLinkFilter(query);
        query = applyCatalogSorting(query, filters.sortBy, filters.sortDirection);

        const response = await query.range(from, to);
        if (response.error) throw response.error;
        data = response.data;
        count = response.count || 0;
      }

      setTitles((data || []).map(mapCanonicalTitle));
      setTotalCount(count);
    } catch (error) {
      console.error('Error fetching titles:', error);
      toast.error(error.message || t('admin.titles.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, filters, t]);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    filters.searchTerm,
    filters.type,
    filters.subtype,
    filters.status,
    filters.originCountry,
    filters.isAdult,
    filters.hasLinks,
    filters.hasTrailer,
    filters.yearFrom,
    filters.yearTo,
    filters.scoreMin,
    filters.scoreMax,
    filters.sortBy,
    filters.sortDirection,
  ]);

  const handleDelete = async (id) => {
    if (!supabase) {
      toast.error(t('admin.titles.supabaseUnavailable'));
      return;
    }

    if (!window.confirm(t('admin.titles.confirmDelete'))) return;

    const toastId = toast.loading(t('admin.titles.deleting'));
    try {
      const { error } = await supabase.from('canonical_titles').delete().eq('id', id);
      if (error) throw error;

      toast.success(t('admin.titles.deleted'), { id: toastId });
      if (titles.length === 1 && currentPage > 1) {
        setCurrentPage((page) => page - 1);
      } else {
        fetchTitles();
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.message, { id: toastId });
    }
  };

  const activeFilterCount = useMemo(() => (
    [
      filters.searchTerm.trim(),
      filters.type,
      filters.subtype,
      filters.status,
      filters.originCountry,
      filters.isAdult,
      filters.hasLinks,
      filters.hasTrailer,
      filters.yearFrom,
      filters.yearTo,
      filters.scoreMin,
      filters.scoreMax,
    ].filter((value) => value !== '' && value !== 'all').length
  ), [filters]);

  const handleFilterChange = (key) => (event) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      type: 'all',
      subtype: 'all',
      status: 'all',
      originCountry: 'all',
      isAdult: 'all',
      hasLinks: 'all',
      hasTrailer: 'all',
      yearFrom: '',
      yearTo: '',
      scoreMin: '',
      scoreMax: '',
      sortBy: 'recent',
      sortDirection: 'desc',
    });
  };

  const handleExport = useCallback(async (exportType) => {
    if (!supabase) {
      toast.error(t('admin.titles.supabaseUnavailable'));
      return;
    }

    const exportFilters = buildExportFilters(filters, exportType);
    const exportLabel = getTitleTypeMeta(exportType, language).displayLabel;
    setExportingType(exportType);

    try {
      const searchTerm = exportFilters.searchTerm.trim();
      let linkIds = null;

      if (exportFilters.hasLinks !== 'all') {
        linkIds = await resolveOfficialLinkIds();
        if (exportFilters.hasLinks === 'yes' && linkIds.length === 0) {
          toast.error(t('admin.titles.exportEmpty', { label: exportLabel }));
          return;
        }
      }

      let matchingIds = null;
      if (searchTerm) {
        matchingIds = await resolveMatchingIds(searchTerm, exportFilters);

        if (linkIds !== null) {
          const linkSet = new Set(linkIds);
          matchingIds = exportFilters.hasLinks === 'yes'
            ? matchingIds.filter((id) => linkSet.has(id))
            : matchingIds.filter((id) => !linkSet.has(id));
        }

        if (matchingIds.length === 0) {
          toast.error(t('admin.titles.exportEmpty', { label: exportLabel }));
          return;
        }
      }

      const collected = [];
      let from = 0;

      while (true) {
        let query = supabase
          .from('canonical_titles')
          .select(EXPORT_TITLE_SELECT);

        query = applyCatalogFilters(query, exportFilters);

        if (matchingIds) {
          query = query.in('id', matchingIds);
        } else if (linkIds !== null) {
          if (exportFilters.hasLinks === 'yes') {
            query = query.in('id', linkIds);
          } else if (linkIds.length > 0) {
            query = query.not('id', 'in', `(${linkIds.join(',')})`);
          }
        }

        query = applyCatalogSorting(query, exportFilters.sortBy, exportFilters.sortDirection);

        const { data, error } = await query.range(from, from + EXPORT_BATCH_SIZE - 1);
        if (error) throw error;

        const batch = data || [];
        if (batch.length === 0) break;

        collected.push(...batch);

        if (batch.length < EXPORT_BATCH_SIZE) break;
        from += EXPORT_BATCH_SIZE;
      }

      const exportLines = [...new Set(collected.map(getAdminPrimaryTitle).filter(Boolean))];
      if (exportLines.length === 0) {
        toast.error(t('admin.titles.exportEmpty', { label: exportLabel }));
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`moodtoon-${exportType}-${stamp}.txt`, exportLines.join('\r\n'));
      toast.success(t('admin.titles.exportSuccess', { count: exportLines.length, label: exportLabel }));
    } catch (error) {
      console.error(`Export ${exportType} error:`, error);
      toast.error(error.message || t('admin.titles.exportFailed', { label: exportLabel }));
    } finally {
      setExportingType('');
    }
  }, [filters, language, t]);

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>{t('admin.titles.pageTitle')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('admin.titles.pageSubtitle')}
          </p>
        </div>
        <Link
          to="/admin/titles/new"
          className="primary-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
        >
          {t('admin.titles.createTitle')}
        </Link>
      </div>

      <div
        className="admin-controls glass"
        style={{
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-6)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-4)',
          alignItems: 'end',
        }}
      >
        <label>
          <span className="form-label">{t('admin.titles.filterSearch')}</span>
          <input
            type="text"
            placeholder={t('admin.titles.searchPlaceholder')}
            className="form-input"
            value={filters.searchTerm}
            onChange={handleFilterChange('searchTerm')}
          />
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterType')}</span>
          <select className="form-select" value={filters.type} onChange={handleFilterChange('type')}>
            <option value="all">{t('admin.titles.allTypes')}</option>
            <option value="anime">{t('admin.titles.typeAnime')}</option>
            <option value="manga">{t('admin.titles.typeManga')}</option>
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterSubtype')}</span>
          <select className="form-select" value={filters.subtype} onChange={handleFilterChange('subtype')}>
            {SUBTYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterStatus')}</span>
          <select className="form-select" value={filters.status} onChange={handleFilterChange('status')}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterCountry')}</span>
          <select className="form-select" value={filters.originCountry} onChange={handleFilterChange('originCountry')}>
            {ORIGIN_COUNTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterRating')}</span>
          <select className="form-select" value={filters.isAdult} onChange={handleFilterChange('isAdult')}>
            {ADULT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterLinks')}</span>
          <select className="form-select" value={filters.hasLinks} onChange={handleFilterChange('hasLinks')}>
            <option value="all">{t('admin.titles.linkAll')}</option>
            <option value="yes">{t('admin.titles.linkHas')}</option>
            <option value="no">{t('admin.titles.linkNone')}</option>
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterTrailer')}</span>
          <select className="form-select" value={filters.hasTrailer} onChange={handleFilterChange('hasTrailer')}>
            <option value="all">{t('admin.titles.trailerAll')}</option>
            <option value="yes">{t('admin.titles.trailerHas')}</option>
            <option value="no">{t('admin.titles.trailerNone')}</option>
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.yearFrom')}</span>
          <input
            type="number"
            className="form-input"
            min="1900"
            max="2100"
            placeholder={t('admin.titles.yearFromPlaceholder')}
            value={filters.yearFrom}
            onChange={handleFilterChange('yearFrom')}
          />
        </label>
        <label>
          <span className="form-label">{t('admin.titles.yearTo')}</span>
          <input
            type="number"
            className="form-input"
            min="1900"
            max="2100"
            placeholder={t('admin.titles.yearToPlaceholder')}
            value={filters.yearTo}
            onChange={handleFilterChange('yearTo')}
          />
        </label>
        <label>
          <span className="form-label">{t('admin.titles.scoreMin')}</span>
          <input
            type="number"
            className="form-input"
            min="0"
            max="100"
            placeholder={t('admin.titles.scoreMinPlaceholder')}
            value={filters.scoreMin}
            onChange={handleFilterChange('scoreMin')}
          />
        </label>
        <label>
          <span className="form-label">{t('admin.titles.scoreMax')}</span>
          <input
            type="number"
            className="form-input"
            min="0"
            max="100"
            placeholder={t('admin.titles.scoreMaxPlaceholder')}
            value={filters.scoreMax}
            onChange={handleFilterChange('scoreMax')}
          />
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterSort')}</span>
          <select className="form-select" value={filters.sortBy} onChange={handleFilterChange('sortBy')}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.filterDirection')}</span>
          <select className="form-select" value={filters.sortDirection} onChange={handleFilterChange('sortDirection')}>
            {SORT_DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="action-btn" onClick={fetchTitles} type="button">
          {t('admin.common.refresh')}
        </button>
        <button
          className="action-btn"
          onClick={clearFilters}
          type="button"
          disabled={activeFilterCount === 0 && filters.sortBy === 'recent' && filters.sortDirection === 'desc'}
        >
          {t('admin.common.reset')}
        </button>
      </div>

      <div className="admin-list-toolbar">
        <span className="admin-list-summary">
          {isLoading
            ? t('admin.titles.loading')
            : t('admin.titles.results', { total: totalCount, page: currentPage, pages: totalPages, s: totalCount === 1 ? '' : 's' })}
        </span>
        <div className="admin-list-actions">
          <span className="admin-list-summary subtle">{t('admin.titles.perPage')}</span>
          <div className="admin-export-group" role="group" aria-label={t('admin.titles.exportGroupLabel')}>
            <span className="admin-export-label">{t('admin.titles.exportLabel')}</span>
            {exportOptions.map((option) => (
              <button
                key={option.id}
                className={`action-btn admin-export-btn ${exportingType === option.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => handleExport(option.id)}
                disabled={isLoading || exportingType !== ''}
              >
                {exportingType === option.id ? t('admin.titles.exporting') : option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-table-container">
        {isLoading ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('admin.common.loading')}
          </div>
        ) : titles.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('admin.titles.noTitles')}
          </div>
        ) : (
          <table className="admin-table admin-table-fixed">
            <thead>
              <tr>
                <th style={{ width: '72px' }}>{t('admin.titles.colCover')}</th>
                <th>{t('admin.titles.colTitle')}</th>
                <th style={{ width: '110px' }}>{t('admin.titles.colType')}</th>
                <th style={{ width: '160px' }}>{t('admin.titles.colYearStatus')}</th>
                <th style={{ width: '130px' }}>{t('admin.titles.colTrailer')}</th>
                <th style={{ width: '90px' }}>{t('admin.titles.colScore')}</th>
                <th style={{ width: '160px', textAlign: 'right' }}>{t('admin.titles.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {titles.map((title) => {
                const typeMeta = getTitleTypeMeta(title.type);
                return (
                  <tr key={title.id}>
                    <td>
                      <img
                        src={title.cover}
                        alt={title.title_en}
                        style={{ width: '40px', height: '56px', objectFit: 'cover', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)' }}
                        loading="lazy"
                      />
                    </td>
                    <td>
                      <div className="admin-title-cell">
                        <div className="admin-title-primary" title={title.title_en || t('admin.titles.untitled')}>
                          {title.title_en || t('admin.titles.untitled')}
                        </div>
                        {title.title_th && (
                          <div className="admin-title-secondary" title={title.title_th}>
                            {title.title_th}
                          </div>
                        )}
                        <div className="admin-title-meta" title={t('admin.titles.slugId', { slug: title.slug, id: title.id })}>
                          {t('admin.titles.slugId', { slug: title.slug, id: title.id })}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${typeMeta.badgeClass}`}>{typeMeta.label}</span>
                    </td>
                    <td>
                      <div>{title.year || '-'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {title.status || t('admin.titles.statusUnknown')}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: '0.2rem' }}>
                        <strong style={{ color: title.trailer?.watchUrl ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {title.trailer?.watchUrl ? t('admin.titles.trailerReady') : t('admin.titles.trailerMissing')}
                        </strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {title.trailer?.site || t('admin.titles.trailerUnknown')}
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--warning)' }}>{title.score ? (title.score / 10).toFixed(1) : t('admin.titles.notAvailable')}</strong>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Link to={`/admin/titles/${title.id}`} className="action-btn" style={{ textDecoration: 'none' }}>
                          {t('admin.common.edit')}
                        </Link>
                        <button
                          className="action-btn"
                          style={{ color: 'var(--error)' }}
                          onClick={() => handleDelete(title.id)}
                          type="button"
                        >
                          {t('admin.common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="admin-pagination">
          <button
            className="action-btn"
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            {t('common.previous')}
          </button>
          <span className="admin-list-summary">{t('common.page')} {currentPage} / {totalPages}</span>
          <button
            className="action-btn"
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminTitles;



