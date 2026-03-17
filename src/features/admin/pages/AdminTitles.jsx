import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { CANONICAL_TITLE_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import { supabase } from '@/shared/lib/supabase';
import { getTitleTypeMeta } from '@/shared/lib/titleType';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const PAGE_SIZE = 10;

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
  const { t } = useLanguage();

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
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    searchTerm: '',
    type: 'all',
    subtype: 'all',
    status: 'all',
    originCountry: 'all',
    isAdult: 'all',
    yearFrom: '',
    yearTo: '',
    scoreMin: '',
    scoreMax: '',
    sortBy: 'recent',
    sortDirection: 'desc',
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchTitles = useCallback(async () => {
    if (!supabase) {
      toast.error('Unable to connect to Supabase');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const searchTerm = filters.searchTerm.trim();

      let data;
      let count = 0;

      if (searchTerm) {
        const matchingIds = await resolveMatchingIds(searchTerm, filters);
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
      toast.error(error.message || 'Failed to load catalog titles');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, filters]);

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
    filters.yearFrom,
    filters.yearTo,
    filters.scoreMin,
    filters.scoreMax,
    filters.sortBy,
    filters.sortDirection,
  ]);

  const handleDelete = async (id, title) => {
    if (!supabase) {
      toast.error('Unable to connect to Supabase');
      return;
    }

    if (!window.confirm(t('admin.titles.confirmDelete'))) return;

    const toastId = toast.loading('Deleting...');
    try {
      const { error } = await supabase.from('canonical_titles').delete().eq('id', id);
      if (error) throw error;

      toast.success('Deleted', { id: toastId });
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
      yearFrom: '',
      yearTo: '',
      scoreMin: '',
      scoreMax: '',
      sortBy: 'recent',
      sortDirection: 'desc',
    });
  };

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
          <span className="form-label">Search</span>
          <input
            type="text"
            placeholder={t('admin.titles.searchPlaceholder')}
            className="form-input"
            value={filters.searchTerm}
            onChange={handleFilterChange('searchTerm')}
          />
        </label>
        <label>
          <span className="form-label">Type</span>
          <select className="form-select" value={filters.type} onChange={handleFilterChange('type')}>
            <option value="all">All types</option>
            <option value="anime">Anime</option>
            <option value="manga">Manga</option>
          </select>
        </label>
        <label>
          <span className="form-label">Subtype</span>
          <select className="form-select" value={filters.subtype} onChange={handleFilterChange('subtype')}>
            {SUBTYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Status</span>
          <select className="form-select" value={filters.status} onChange={handleFilterChange('status')}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Country</span>
          <select className="form-select" value={filters.originCountry} onChange={handleFilterChange('originCountry')}>
            {ORIGIN_COUNTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Rating</span>
          <select className="form-select" value={filters.isAdult} onChange={handleFilterChange('isAdult')}>
            {ADULT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">{t('admin.titles.yearFrom')}</span>
          <input
            type="number"
            className="form-input"
            min="1900"
            max="2100"
            placeholder="2000"
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
            placeholder="2026"
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
            placeholder="70"
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
            placeholder="100"
            value={filters.scoreMax}
            onChange={handleFilterChange('scoreMax')}
          />
        </label>
        <label>
          <span className="form-label">Sort</span>
          <select className="form-select" value={filters.sortBy} onChange={handleFilterChange('sortBy')}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Direction</span>
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
            : `${totalCount} results • page ${currentPage} of ${totalPages}`}
        </span>
        <span className="admin-list-summary subtle">{t('admin.titles.perPage')}</span>
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
                        <div className="admin-title-meta" title={`Slug: ${title.slug} • ID: ${title.id}`}>
                          {title.slug} • ID: {title.id}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${typeMeta.badgeClass}`}>{typeMeta.label}</span>
                    </td>
                    <td>
                      <div>{title.year || '-'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {title.status || 'unknown'}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--warning)' }}>{title.score ? (title.score / 10).toFixed(1) : 'N/A'}</strong>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Link to={`/admin/titles/${title.id}`} className="action-btn" style={{ textDecoration: 'none' }}>
                          {t('admin.common.edit')}
                        </Link>
                        <button
                          className="action-btn"
                          style={{ color: 'var(--error)' }}
                          onClick={() => handleDelete(title.id, title.title_en)}
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
          <span className="admin-list-summary">Page {currentPage} / {totalPages}</span>
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
