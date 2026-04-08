import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  LayoutTemplate,
  ListOrdered,
  Loader2,
  MessageSquare,
  Music2,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  deleteAdminTierlistRecord,
  fetchAdminTierlistLists,
  fetchAdminTierlistOverview,
  fetchAdminTierlistRecordDetail,
  fetchAdminTierlistTemplates,
  updateAdminTierlistVisibility,
} from '@/features/admin/api';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
} from '@/shared/lib/catalogEntities';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';
const TEMPLATE_CATEGORY_CHARACTER_PREFIX = 'character::';
const TEMPLATE_CATEGORY_THEME_SONG_PREFIX = 'theme_song::';
const PAGE_SIZE = 30;

function decodeTemplateCategory(rawCategory) {
  const value = String(rawCategory || 'general');
  if (value.startsWith(TEMPLATE_CATEGORY_CHARACTER_PREFIX)) {
    return {
      entityType: CHARACTER_ENTITY_TYPE,
      category: value.slice(TEMPLATE_CATEGORY_CHARACTER_PREFIX.length) || 'general',
    };
  }
  if (value.startsWith(TEMPLATE_CATEGORY_THEME_SONG_PREFIX)) {
    return {
      entityType: THEME_SONG_ENTITY_TYPE,
      category: value.slice(TEMPLATE_CATEGORY_THEME_SONG_PREFIX.length) || 'general',
    };
  }
  return {
    entityType: TITLE_ENTITY_TYPE,
    category: value || 'general',
  };
}

function formatDate(value, locale) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function getEntityTypeLabel(entityType, pick) {
  if (entityType === CHARACTER_ENTITY_TYPE) {
    return pick('ตัวละคร', 'Character');
  }
  if (entityType === THEME_SONG_ENTITY_TYPE) {
    return pick('เพลง', 'Theme Song');
  }
  return pick('เรื่อง', 'Title');
}

function getEntityTypeIcon(entityType) {
  if (entityType === THEME_SONG_ENTITY_TYPE) {
    return Music2;
  }
  if (entityType === CHARACTER_ENTITY_TYPE) {
    return Users;
  }
  return Sparkles;
}

function buildTemplateIssues(template, pick) {
  const issues = [];

  if (template.itemCount === 0) {
    issues.push(pick('เทมเพลตนี้ไม่มีรายการให้จัดอันดับ', 'This template has no entries to rank'));
  }

  if (!template.isSystem && !template.ownerUserId) {
    issues.push(pick('ไม่พบเจ้าของเทมเพลต', 'Template owner is missing'));
  }

  return issues;
}

function buildListIssues(list, pick) {
  const issues = [];

  if (list.isPublic && list.rankedCount === 0) {
    issues.push(pick('ลิสต์สาธารณะนี้ยังไม่มีอันดับที่จัดไว้', 'This public list has no ranked entries'));
  }

  if (list.totalItemCount === 0) {
    issues.push(pick('ลิสต์นี้ไม่มี item ใน tier หรือในคลังภาพ', 'This list has no items in rows or pool'));
  }

  if (list.templateId && !list.hasTemplate) {
    issues.push(pick('ลิสต์นี้อ้างถึงเทมเพลตที่หาไม่เจอ', 'This list points to a missing template'));
  }

  return issues;
}

function getRecordSearchText(record) {
  return [
    record.id,
    record.title,
    record.description,
    record.ownerLabel,
    record.category,
    record.templateTitle,
  ].join(' ').toLowerCase();
}

function formatCompactNumber(value, locale) {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function getOwnerLabel(profile, fallbackName, fallbackUsername, pick) {
  return profile?.name || profile?.username || fallbackName || fallbackUsername || pick('ไม่ระบุ', 'Unknown');
}

function TierlistIssueList({ issues, pick }) {
  if (!issues.length) {
    return (
      <p className="admin-tierlist-muted">
        {pick('ยังไม่พบสัญญาณผิดปกติจากข้อมูลที่โหลดมา', 'No obvious integrity issues found in the loaded data.')}
      </p>
    );
  }

  return (
    <ul className="admin-tierlist-issue-list">
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

export function AdminTierlists() {
  const { user } = useAuth();
  const { language, pick } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const isAdmin = user?.profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState('templates');
  const [selectedId, setSelectedId] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    searchTerm: '',
    visibility: 'all',
    entityType: 'all',
    issueState: 'all',
    sortBy: 'updated',
  });

  const overviewQuery = useQuery({
    queryKey: ['admin-tierlists-overview'],
    queryFn: fetchAdminTierlistOverview,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const templatesQuery = useQuery({
    queryKey: ['admin-tierlists-templates'],
    queryFn: fetchAdminTierlistTemplates,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const listsQuery = useQuery({
    queryKey: ['admin-tierlists-lists'],
    queryFn: fetchAdminTierlistLists,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const summary = overviewQuery.data || {
    template_count: 0,
    public_template_count: 0,
    template_issue_count: 0,
    list_count: 0,
    public_list_count: 0,
    broken_public_list_count: 0,
    comment_count: 0,
  };

  const templates = useMemo(() => {
    const rows = templatesQuery.data || [];

    return rows.map((row) => {
      const decoded = decodeTemplateCategory(row.category);
      const ownerProfile = row.owner_name || row.owner_username
        ? { name: row.owner_name || '', username: row.owner_username || '' }
        : null;
      const mappedTemplate = {
        kind: 'template',
        id: row.id,
        title: row.title || pick('ไม่มีชื่อเทมเพลต', 'Untitled template'),
        description: row.description || '',
        category: decoded.category,
        entityType: decoded.entityType,
        itemCount: Number(row.item_count || 0),
        titleIds: [],
        defaultRows: [],
        isPublic: Boolean(row.is_public),
        isSystem: Boolean(row.is_system),
        plays: Number(row.plays || 0),
        ownerUserId: row.owner_user_id || null,
        ownerLabel: row.is_system
          ? pick('ระบบ', 'System')
          : getOwnerLabel(ownerProfile, '', '', pick),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        linkedListCount: Number(row.linked_list_count || 0),
        linkedPublicListCount: Number(row.linked_public_list_count || 0),
        path: `/tierlist/template/${row.id}`,
      };

      return {
        ...mappedTemplate,
        issues: buildTemplateIssues(mappedTemplate, pick),
      };
    });
  }, [pick, templatesQuery.data]);

  const lists = useMemo(() => {
    const rows = listsQuery.data || [];

    return rows.map((row) => {
      const decodedTemplateCategory = decodeTemplateCategory(row.template_category);
      const ownerProfile = row.owner_name || row.owner_username
        ? { name: row.owner_name || '', username: row.owner_username || '' }
        : null;

      const mappedList = {
        kind: 'list',
        id: row.id,
        title: row.title || pick('ไม่มีชื่อลิสต์', 'Untitled list'),
        description: row.description || '',
        templateId: row.template_id || '',
        templateTitle: row.template_title || '',
        hasTemplate: Boolean(row.has_template),
        entityType: decodedTemplateCategory.entityType || TITLE_ENTITY_TYPE,
        ownerUserId: row.owner_user_id || null,
        ownerLabel: getOwnerLabel(ownerProfile, row.owner_name, row.owner_username, pick),
        isPublic: Boolean(row.is_public),
        playCount: Number(row.play_count || 0),
        rankedCount: Number(row.ranked_count || 0),
        poolCount: Number(row.pool_count || 0),
        totalItemCount: Number(row.total_item_count || 0),
        tierCount: Number(row.tier_count || 0),
        rows: [],
        commentCount: Number(row.comment_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        path: `/tierlist/play/${row.id}`,
      };

      return {
        ...mappedList,
        issues: buildListIssues(mappedList, pick),
      };
    });
  }, [listsQuery.data, pick]);

  const activeRecordsQuery = activeTab === 'templates' ? templatesQuery : listsQuery;
  const records = activeTab === 'templates' ? templates : lists;
  const selectedSummaryRecord = useMemo(
    () => records.find((record) => record.id === selectedId) || null,
    [records, selectedId],
  );

  const selectedDetailQuery = useQuery({
    queryKey: ['admin-tierlists-detail', selectedSummaryRecord?.kind || null, selectedSummaryRecord?.id || null],
    queryFn: () => fetchAdminTierlistRecordDetail(selectedSummaryRecord.kind, selectedSummaryRecord.id),
    enabled: Boolean(selectedSummaryRecord?.id),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const selectedRecord = useMemo(() => {
    if (!selectedSummaryRecord) return null;

    if (selectedSummaryRecord.kind === 'template') {
      return {
        ...selectedSummaryRecord,
        defaultRows: selectedDetailQuery.data?.defaultRows || [],
        titleIds: selectedDetailQuery.data?.titleIds || [],
      };
    }

    return {
      ...selectedSummaryRecord,
      rows: selectedDetailQuery.data?.rows || [],
      poolItems: selectedDetailQuery.data?.poolItems || [],
    };
  }, [selectedDetailQuery.data, selectedSummaryRecord]);

  const isLoading = !records.length && activeRecordsQuery.isLoading;
  const errorMessage = overviewQuery.error?.message || activeRecordsQuery.error?.message || '';
  const templateIssueCount = Number(summary.template_issue_count || 0);
  const brokenPublicLists = Number(summary.broken_public_list_count || 0);
  const isPageFetching = overviewQuery.isFetching || templatesQuery.isFetching || listsQuery.isFetching;

  const visibleRecords = useMemo(() => {
    const normalizedSearch = filters.searchTerm.trim().toLowerCase();

    const filtered = records.filter((record) => {
      const matchesSearch = !normalizedSearch || getRecordSearchText(record).includes(normalizedSearch);
      const matchesVisibility = (() => {
        if (filters.visibility === 'all') return true;
        if (filters.visibility === 'public') return record.isPublic;
        if (filters.visibility === 'private') return !record.isPublic;
        if (filters.visibility === 'system') return record.kind === 'template' ? record.isSystem : false;
        return true;
      })();
      const matchesEntityType = filters.entityType === 'all' || record.entityType === filters.entityType;
      const matchesIssueState = filters.issueState === 'all'
        ? true
        : filters.issueState === 'issues'
          ? record.issues.length > 0
          : record.issues.length === 0;

      return matchesSearch && matchesVisibility && matchesEntityType && matchesIssueState;
    });

    return [...filtered].sort((left, right) => {
      if (filters.sortBy === 'items') {
        const leftValue = left.kind === 'template' ? left.itemCount : left.totalItemCount;
        const rightValue = right.kind === 'template' ? right.itemCount : right.totalItemCount;
        return rightValue - leftValue;
      }

      if (filters.sortBy === 'engagement') {
        const leftValue = left.kind === 'template' ? left.plays : left.playCount;
        const rightValue = right.kind === 'template' ? right.plays : right.playCount;
        return rightValue - leftValue;
      }

      if (filters.sortBy === 'comments') {
        const leftValue = left.kind === 'list' ? left.commentCount : left.linkedPublicListCount;
        const rightValue = right.kind === 'list' ? right.commentCount : right.linkedPublicListCount;
        return rightValue - leftValue;
      }

      if (filters.sortBy === 'created') {
        return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
      }

      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    });
  }, [filters, records]);

  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / PAGE_SIZE));
  const pagedRecords = useMemo(() => {
    const from = (currentPage - 1) * PAGE_SIZE;
    return visibleRecords.slice(from, from + PAGE_SIZE);
  }, [currentPage, visibleRecords]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filters]);

  useEffect(() => {
    if (!pagedRecords.length) {
      setSelectedId('');
      return;
    }

    if (!selectedId || !pagedRecords.some((record) => record.id === selectedId)) {
      setSelectedId(pagedRecords[0].id);
    }
  }, [pagedRecords, selectedId]);

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      visibility: 'all',
      entityType: 'all',
      issueState: 'all',
      sortBy: 'updated',
    });
  };

  useEffect(() => {
    if (overviewQuery.error || activeRecordsQuery.error) {
      console.error('Failed to load admin tierlists:', overviewQuery.error || activeRecordsQuery.error);
      toast.error(pick('โหลดข้อมูล tierlist ไม่สำเร็จ', 'Failed to load tierlist admin data'));
    }
  }, [activeRecordsQuery.error, overviewQuery.error, pick]);

  useEffect(() => {
    if (selectedDetailQuery.error) {
      console.error('Failed to load tierlist detail:', selectedDetailQuery.error);
      toast.error(pick('โหลดรายละเอียด tierlist ไม่สำเร็จ', 'Failed to load tierlist detail'));
    }
  }, [pick, selectedDetailQuery.error]);

  const refreshTierlistData = async ({ showToast = true } = {}) => {
    try {
      const results = await Promise.all([
        overviewQuery.refetch(),
        templatesQuery.refetch(),
        listsQuery.refetch(),
        selectedSummaryRecord ? selectedDetailQuery.refetch() : Promise.resolve({ error: null }),
      ]);

      if (results.some((result) => result?.error)) {
        throw results.find((result) => result?.error)?.error;
      }

      if (showToast) {
        toast.success(pick('รีเฟรชข้อมูล tierlist แล้ว', 'Tierlist data refreshed'));
      }
    } catch (error) {
      toast.error(error?.message || pick('รีเฟรชข้อมูลไม่สำเร็จ', 'Failed to refresh tierlist data'));
    }
  };

  const handleToggleVisibility = async () => {
    if (!selectedRecord) return;

    const nextValue = !selectedRecord.isPublic;

    setIsActing(true);
    try {
      await updateAdminTierlistVisibility(selectedRecord.kind, selectedRecord.id, nextValue);
      toast.success(nextValue ? pick('อัปเดตเป็นสาธารณะแล้ว', 'Marked as public') : pick('อัปเดตเป็นส่วนตัวแล้ว', 'Marked as private'));
      await refreshTierlistData({ showToast: false });
    } catch (error) {
      console.error('Failed to update tierlist visibility:', error);
      toast.error(error?.message || pick('อัปเดตสถานะไม่สำเร็จ', 'Failed to update visibility'));
    } finally {
      setIsActing(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecord) return;

    if (selectedRecord.kind === 'template' && selectedRecord.linkedListCount > 0) {
      toast.error(
        pick(
          'ลบเทมเพลตนี้ไม่ได้จนกว่าจะจัดการลิสต์ที่ผูกอยู่ก่อน',
          'This template still has linked lists. Remove or reassign those lists first.',
        ),
      );
      return;
    }

    const confirmed = window.confirm(
      pick(
        `ต้องการลบ ${selectedRecord.title} ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`,
        `Delete ${selectedRecord.title}? This action cannot be undone.`,
      ),
    );
    if (!confirmed) return;

    setIsActing(true);
    try {
      await deleteAdminTierlistRecord(selectedRecord.kind, selectedRecord.id);
      toast.success(pick('ลบรายการเรียบร้อยแล้ว', 'Tierlist record deleted'));
      await refreshTierlistData({ showToast: false });
    } catch (error) {
      console.error('Failed to delete tierlist record:', error);
      toast.error(error?.message || pick('ลบรายการไม่สำเร็จ', 'Failed to delete tierlist record'));
    } finally {
      setIsActing(false);
    }
  };

  const SelectedEntityIcon = selectedRecord ? getEntityTypeIcon(selectedRecord.entityType) : ListOrdered;

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <ListOrdered size={30} color="var(--primary-500)" />
            {pick('จัดการ Tier List', 'Tier List Control Room')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '68ch' }}>
            {pick(
              'ดูภาพรวมเทมเพลตและลิสต์ทั้งหมด, ค้นหาปัญหาข้อมูล, เปิดหน้าใช้งานจริง, และจัดการสถานะ public/private ได้จากหน้าเดียว',
              'Review templates and lists in one place, spot data issues, open the live pages, and manage public visibility without leaving the admin desk.',
            )}
          </p>
        </div>
        <button className="action-btn" type="button" onClick={() => void refreshTierlistData()} disabled={isPageFetching || isActing}>
          {isPageFetching ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> : <RefreshCw size={16} style={{ marginRight: 8 }} />}
          {pick('รีเฟรชข้อมูล', 'Refresh')}
        </button>
      </div>

      <div className="admin-stat-row">
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-title">{pick('เทมเพลตทั้งหมด', 'All Templates')}</h3>
            <LayoutTemplate size={18} color="var(--primary-400)" />
          </div>
          <p className="stat-value" style={{ color: 'var(--primary-600)' }}>{Number(summary.template_count || 0).toLocaleString(locale)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-title">{pick('เทมเพลตสาธารณะ', 'Public Templates')}</h3>
            <Eye size={18} color="var(--success)" />
          </div>
          <p className="stat-value" style={{ color: 'var(--success)' }}>{Number(summary.public_template_count || 0).toLocaleString(locale)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-title">{pick('ลิสต์ทั้งหมด', 'All Lists')}</h3>
            <ListOrdered size={18} color="var(--primary-400)" />
          </div>
          <p className="stat-value" style={{ color: 'var(--primary-600)' }}>{Number(summary.list_count || 0).toLocaleString(locale)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-title">{pick('ลิสต์สาธารณะ', 'Public Lists')}</h3>
            <Eye size={18} color="var(--success)" />
          </div>
          <p className="stat-value" style={{ color: 'var(--success)' }}>{Number(summary.public_list_count || 0).toLocaleString(locale)}</p>
        </div>
      </div>

      <div className="admin-mini-stats" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-mini-stat">
          <AlertTriangle size={14} color="var(--text-tertiary)" />
          <span className="admin-mini-stat-label">{pick('เทมเพลตที่ต้องเช็ค', 'Templates with issues')}</span>
          <strong className="admin-mini-stat-value">{templateIssueCount.toLocaleString(locale)}</strong>
        </div>
        <div className="admin-mini-stat-divider" />
        <div className="admin-mini-stat">
          <AlertTriangle size={14} color="var(--text-tertiary)" />
          <span className="admin-mini-stat-label">{pick('ลิสต์สาธารณะที่น่าสงสัย', 'Broken public lists')}</span>
          <strong className="admin-mini-stat-value">{brokenPublicLists.toLocaleString(locale)}</strong>
        </div>
        <div className="admin-mini-stat-divider" />
        <div className="admin-mini-stat">
          <MessageSquare size={14} color="var(--text-tertiary)" />
          <span className="admin-mini-stat-label">{pick('คอมเมนต์ทั้งหมด', 'Tierlist comments')}</span>
          <strong className="admin-mini-stat-value">{Number(summary.comment_count || 0).toLocaleString(locale)}</strong>
        </div>
      </div>

      <section className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-panel-heading">
          <div>
            <h2>{pick('ตัวกรองและโหมดดูข้อมูล', 'Filters and review mode')}</h2>
            <p>{pick('สลับดูเทมเพลตหรือลิสต์ แล้วคัดเฉพาะรายการที่ต้องลงมือจัดการ', 'Switch between templates and lists, then narrow down the records that need attention.')}</p>
          </div>
        </div>

        <div className="admin-chip-grid" style={{ marginBottom: 'var(--space-5)' }}>
          <button type="button" className={`admin-filter-chip ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            <LayoutTemplate size={16} />
            {pick('เทมเพลต', 'Templates')}
          </button>
          <button type="button" className={`admin-filter-chip ${activeTab === 'lists' ? 'active' : ''}`} onClick={() => setActiveTab('lists')}>
            <ListOrdered size={16} />
            {pick('ลิสต์', 'Lists')}
          </button>
        </div>

        <div className="admin-form-grid" role="toolbar" aria-label={pick('ตัวกรองหน้าจัดการ tierlist', 'Tierlist admin filters')}>
          <label className="admin-form-grid-wide">
            <span className="form-label">{pick('ค้นหา', 'Search')}</span>
            <input
              type="text"
              className="form-input"
              value={filters.searchTerm}
              placeholder={pick('ค้นหาจากชื่อ, owner, category, id', 'Search by title, owner, category, or id')}
              onChange={(event) => setFilters((current) => ({ ...current, searchTerm: event.target.value }))}
            />
          </label>
          <SortSelect value={filters.visibility} onChange={(value) => setFilters((current) => ({ ...current, visibility: value }))} label={pick('สถานะการมองเห็น', 'Visibility')} className="results-sorter">
            <option value="all">{pick('ทั้งหมด', 'All')}</option>
            <option value="public">{pick('สาธารณะ', 'Public')}</option>
            <option value="private">{pick('ส่วนตัว', 'Private')}</option>
            {activeTab === 'templates' ? <option value="system">{pick('ของระบบ', 'System')}</option> : null}
          </SortSelect>
          <SortSelect value={filters.entityType} onChange={(value) => setFilters((current) => ({ ...current, entityType: value }))} label={pick('ชนิดข้อมูล', 'Entity Type')} className="results-sorter">
            <option value="all">{pick('ทุกชนิด', 'All types')}</option>
            <option value={TITLE_ENTITY_TYPE}>{pick('เรื่อง', 'Title')}</option>
            <option value={CHARACTER_ENTITY_TYPE}>{pick('ตัวละคร', 'Character')}</option>
            <option value={THEME_SONG_ENTITY_TYPE}>{pick('เพลง', 'Theme Song')}</option>
          </SortSelect>
          <SortSelect value={filters.issueState} onChange={(value) => setFilters((current) => ({ ...current, issueState: value }))} label={pick('สถานะปัญหา', 'Issue State')} className="results-sorter">
            <option value="all">{pick('ทั้งหมด', 'All')}</option>
            <option value="issues">{pick('มีปัญหา', 'Issues only')}</option>
            <option value="clean">{pick('ปกติ', 'Healthy only')}</option>
          </SortSelect>
          <SortSelect value={filters.sortBy} onChange={(value) => setFilters((current) => ({ ...current, sortBy: value }))} label={pick('เรียงตาม', 'Sort by')} className="results-sorter">
            <option value="updated">{pick('อัปเดตล่าสุด', 'Recently updated')}</option>
            <option value="created">{pick('สร้างล่าสุด', 'Recently created')}</option>
            <option value="engagement">{pick('ยอดเล่น', 'Plays')}</option>
            <option value="items">{pick('จำนวน item', 'Item count')}</option>
            <option value="comments">{activeTab === 'lists' ? pick('จำนวนคอมเมนต์', 'Comment count') : pick('จำนวนลิสต์สาธารณะ', 'Public remixes')}</option>
          </SortSelect>
        </div>

        <div className="admin-form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="admin-list-summary subtle">
            {pick(
              `กำลังแสดง ${pagedRecords.length.toLocaleString(locale)} จาก ${visibleRecords.length.toLocaleString(locale)} รายการในโหมด ${activeTab === 'templates' ? 'เทมเพลต' : 'ลิสต์'}`,
              `Showing ${pagedRecords.length.toLocaleString(locale)} of ${visibleRecords.length.toLocaleString(locale)} records in ${activeTab === 'templates' ? 'templates' : 'lists'} mode`,
            )}
          </p>
          <button type="button" className="action-btn" onClick={resetFilters}>
            {pick('ล้างตัวกรอง', 'Clear filters')}
          </button>
        </div>
      </section>

      <div className="admin-split-layout">
        <section className="glass-panel">
          <div className="admin-panel-heading admin-section-header--tight">
            <div>
              <h2>{activeTab === 'templates' ? pick('รายการเทมเพลต', 'Template queue') : pick('รายการลิสต์', 'List queue')}</h2>
              <p>
                {activeTab === 'templates'
                  ? pick('เลือกเทมเพลตเพื่อดูรายละเอียด owner, category, visibility และปัญหาที่ควรตามต่อ', 'Select a template to inspect its owner, category, visibility, and any integrity warnings.')
                  : pick('เลือกลิสต์เพื่อดูโครง tier, จำนวน item, คอมเมนต์ และสถานะ public/private', 'Select a list to inspect its tier structure, item counts, comments, and public/private state.')}
              </p>
            </div>
          </div>
          {isLoading ? (
            <AdminStatePanel title={pick('กำลังโหลดข้อมูล tierlist', 'Loading tierlist records')} description={pick('กำลังดึงข้อมูลสรุปของเทมเพลตและลิสต์สำหรับหน้าแอดมิน', 'Fetching tierlist summaries for the admin workspace.')} />
          ) : errorMessage ? (
            <AdminStatePanel title={pick('โหลดข้อมูลไม่สำเร็จ', 'Could not load data')} description={errorMessage} tone="error" actionLabel={pick('ลองใหม่', 'Try again')} onAction={() => void refreshTierlistData({ showToast: false })} />
          ) : visibleRecords.length === 0 ? (
            <AdminStatePanel title={pick('ไม่พบรายการที่ตรงกับตัวกรอง', 'No matching records')} description={pick('ลองเปลี่ยนคำค้น, สถานะ, หรือโหมดดูข้อมูล แล้วค่อยเช็คอีกครั้ง', 'Try changing the search, visibility, or review mode and check again.')} actionLabel={pick('ล้างตัวกรอง', 'Clear filters')} onAction={resetFilters} />
          ) : (
            <>
              <div className="admin-list-stack">
                {pagedRecords.map((record) => {
                  const EntityIcon = getEntityTypeIcon(record.entityType);
                  return (
                    <button key={record.id} type="button" className={`admin-record-card ${record.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(record.id)}>
                      <div className="admin-tierlist-record-badges">
                        <span className={`admin-queue-pill ${record.isPublic ? 'status-approved' : 'status-dismissed'}`}>{record.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}</span>
                        <span className="admin-queue-pill subtle"><EntityIcon size={13} />{getEntityTypeLabel(record.entityType, pick)}</span>
                        {record.kind === 'template' && record.isSystem ? <span className="admin-queue-pill subtle">{pick('ระบบ', 'System')}</span> : null}
                        {record.issues.length > 0 ? <span className="admin-queue-pill status-open"><AlertTriangle size={13} />{record.issues.length} {pick('ปัญหา', 'issues')}</span> : null}
                      </div>
                      <div className="admin-record-main">
                        <strong className="admin-queue-card-title admin-clamp-2">{record.title}</strong>
                        <span className="admin-queue-card-subtitle admin-clamp-2">{record.description || (record.kind === 'template' ? pick('ไม่มีคำอธิบายเทมเพลต', 'No template description') : pick('ไม่มีคำอธิบายลิสต์', 'No list description'))}</span>
                      </div>
                      <div className="admin-record-meta">
                        <span>
                          {record.kind === 'template'
                            ? pick('{count} item / {plays} plays', '{count} items / {plays} plays').replace('{count}', formatCompactNumber(record.itemCount, locale)).replace('{plays}', formatCompactNumber(record.plays, locale))
                            : pick('{count} item / {plays} plays', '{count} items / {plays} plays').replace('{count}', formatCompactNumber(record.totalItemCount, locale)).replace('{plays}', formatCompactNumber(record.playCount, locale))}
                        </span>
                        <span>{formatDate(record.updatedAt, locale)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 ? (
                <div className="admin-pagination">
                  <button className="action-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                    {pick('ก่อนหน้า', 'Previous')}
                  </button>
                  <span className="admin-list-summary">
                    {pick(`หน้า ${currentPage} / ${totalPages}`, `Page ${currentPage} / ${totalPages}`)}
                  </span>
                  <button className="action-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                    {pick('ถัดไป', 'Next')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="glass-panel">
          {!selectedRecord ? (
            <AdminStatePanel title={pick('ยังไม่ได้เลือกรายการ', 'No record selected')} description={pick('เลือกเทมเพลตหรือลิสต์จากคอลัมน์ซ้ายเพื่อดูรายละเอียดและจัดการต่อ', 'Choose a template or list from the left column to inspect and manage it here.')} />
          ) : (
            <>
              <div className="admin-panel-heading">
                <div>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <SelectedEntityIcon size={22} color="var(--primary-500)" />
                    {selectedRecord.title}
                  </h2>
                  <p>{selectedRecord.kind === 'template' ? `Template ID: ${selectedRecord.id}` : `List ID: ${selectedRecord.id}`}</p>
                </div>
                <div className="admin-inline-actions">
                  <Link className="action-btn" to={selectedRecord.path}>{pick('เปิดหน้าจริง', 'Open live page')}</Link>
                  <button className="action-btn" type="button" onClick={handleToggleVisibility} disabled={isActing}>
                    {isActing ? <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} /> : selectedRecord.isPublic ? <EyeOff size={14} style={{ marginRight: 6 }} /> : <Eye size={14} style={{ marginRight: 6 }} />}
                    {selectedRecord.isPublic ? pick('ทำเป็นส่วนตัว', 'Make private') : pick('ทำเป็นสาธารณะ', 'Make public')}
                  </button>
                  <button className="action-btn" type="button" onClick={handleDeleteRecord} disabled={isActing || !isAdmin || (selectedRecord.kind === 'template' && selectedRecord.linkedListCount > 0)} title={!isAdmin ? pick('เฉพาะแอดมินเท่านั้นที่ลบรายการได้', 'Only admins can delete records') : undefined}>
                    <Trash2 size={14} style={{ marginRight: 6 }} />
                    {pick('ลบ', 'Delete')}
                  </button>
                </div>
              </div>

              {selectedRecord.issues.length > 0 ? (
                <div className="admin-inline-alert admin-inline-alert--error" role="status">
                  <AlertTriangle size={16} />
                  <span>{pick('รายการนี้มีจุดที่ควรตรวจสอบก่อนปล่อยใช้งานต่อ', 'This record has integrity flags worth checking before leaving it live.')}</span>
                </div>
              ) : null}

              <div className="admin-tierlist-detail-grid">
                <div className="admin-tierlist-detail-section">
                  <h3>{pick('ภาพรวม', 'Overview')}</h3>
                  <div className="admin-stat-list">
                    <div><span>{pick('เจ้าของ', 'Owner')}</span><strong>{selectedRecord.ownerLabel}</strong></div>
                    <div><span>{pick('สถานะ', 'Visibility')}</span><strong>{selectedRecord.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}</strong></div>
                    <div><span>{pick('ชนิดข้อมูล', 'Entity type')}</span><strong>{getEntityTypeLabel(selectedRecord.entityType, pick)}</strong></div>
                    <div><span>{pick('อัปเดตล่าสุด', 'Last updated')}</span><strong>{formatDate(selectedRecord.updatedAt, locale)}</strong></div>
                    <div><span>{pick('สร้างเมื่อ', 'Created at')}</span><strong>{formatDate(selectedRecord.createdAt, locale)}</strong></div>
                    {selectedRecord.kind === 'template' ? (
                      <>
                        <div><span>{pick('หมวดหมู่', 'Category')}</span><strong>{selectedRecord.category || '-'}</strong></div>
                        <div><span>{pick('จำนวน item', 'Items')}</span><strong>{selectedRecord.itemCount.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('ยอดเล่น', 'Plays')}</span><strong>{selectedRecord.plays.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('ลิสต์ที่ผูกอยู่', 'Linked lists')}</span><strong>{selectedRecord.linkedListCount.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('ลิสต์สาธารณะ', 'Public remixes')}</span><strong>{selectedRecord.linkedPublicListCount.toLocaleString(locale)}</strong></div>
                      </>
                    ) : (
                      <>
                        <div><span>{pick('เทมเพลตต้นทาง', 'Source template')}</span><strong>{selectedRecord.templateTitle || pick('ไม่พบเทมเพลต', 'Missing template')}</strong></div>
                        <div><span>{pick('จัดอันดับแล้ว', 'Ranked items')}</span><strong>{selectedRecord.rankedCount.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('เหลือในคลังภาพ', 'Pool items')}</span><strong>{selectedRecord.poolCount.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('จำนวน tier', 'Tier rows')}</span><strong>{selectedRecord.tierCount.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('คอมเมนต์', 'Comments')}</span><strong>{selectedRecord.commentCount.toLocaleString(locale)}</strong></div>
                        <div><span>{pick('ยอดเล่น', 'Plays')}</span><strong>{selectedRecord.playCount.toLocaleString(locale)}</strong></div>
                      </>
                    )}
                  </div>
                </div>

                <div className="admin-tierlist-detail-section">
                  <h3>{pick('โครงสร้าง', 'Structure')}</h3>
                  {selectedRecord.description ? <p className="admin-tierlist-description">{selectedRecord.description}</p> : <p className="admin-tierlist-muted">{pick('ไม่มีคำอธิบายเพิ่มเติมสำหรับรายการนี้', 'No extra description is stored for this record.')}</p>}

                  {selectedRecord.kind === 'template' ? (
                    <>
                      <div className="admin-tierlist-subsection">
                        <strong>{pick('แถวเริ่มต้น', 'Default rows')}</strong>
                        <div className="admin-chip-grid" style={{ marginTop: 'var(--space-3)' }}>
                          {selectedDetailQuery.isLoading && !selectedDetailQuery.data
                            ? <span className="admin-tierlist-muted">{pick('กำลังโหลดโครงสร้างเทมเพลต...', 'Loading template structure...')}</span>
                            : selectedRecord.defaultRows.length > 0
                              ? selectedRecord.defaultRows.map((rowLabel) => <span key={rowLabel} className="admin-queue-pill subtle">{rowLabel}</span>)
                              : <span className="admin-tierlist-muted">{pick('ไม่มีค่า default rows', 'No default rows saved')}</span>}
                        </div>
                      </div>
                      <div className="admin-tierlist-subsection">
                        <strong>{pick('ตัวอย่าง item ids', 'Sample item ids')}</strong>
                        <div className="admin-tierlist-code-list">
                          {selectedDetailQuery.isLoading && !selectedDetailQuery.data
                            ? <span className="admin-tierlist-muted">{pick('กำลังโหลด item ids...', 'Loading item ids...')}</span>
                            : (
                              <>
                                {selectedRecord.titleIds.slice(0, 18).map((id) => <code key={`${selectedRecord.id}-${id}`}>{id}</code>)}
                                {selectedRecord.titleIds.length === 0 ? <span className="admin-tierlist-muted">{pick('ไม่มี item ids', 'No item ids')}</span> : null}
                              </>
                            )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-tierlist-subsection">
                        <strong>{pick('สรุปแต่ละ tier', 'Tier breakdown')}</strong>
                        <div className="admin-tierlist-row-grid">
                          {selectedDetailQuery.isLoading && !selectedDetailQuery.data
                            ? <span className="admin-tierlist-muted">{pick('กำลังโหลดโครงสร้างลิสต์...', 'Loading list structure...')}</span>
                            : selectedRecord.rows.length > 0
                              ? selectedRecord.rows.map((row) => (
                                <div key={row.id} className="admin-tierlist-row-card">
                                  <span className="admin-tierlist-row-label">{row.label || pick('ไม่มีชื่อแถว', 'Untitled row')}</span>
                                  <strong>{row.titleIds.length.toLocaleString(locale)} {pick('item', 'items')}</strong>
                                </div>
                              ))
                              : <span className="admin-tierlist-muted">{pick('ไม่มีข้อมูลแถว tier', 'No tier row data')}</span>}
                        </div>
                      </div>
                      <div className="admin-tierlist-subsection">
                        <strong>{pick('สถานะเทมเพลตต้นทาง', 'Template linkage')}</strong>
                        <p className="admin-tierlist-muted">
                          {selectedRecord.hasTemplate
                            ? pick('ลิสต์นี้ยังผูกกับเทมเพลตต้นทางได้ปกติ', 'This list is still linked to its source template.')
                            : pick('ลิสต์นี้กำลังชี้ไปหาเทมเพลตที่ไม่พบแล้ว', 'This list currently points to a template that can no longer be found.')}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="admin-tierlist-detail-section admin-tierlist-detail-section-wide">
                  <h3>{pick('จุดที่ควรตรวจสอบ', 'Diagnostics')}</h3>
                  <TierlistIssueList issues={selectedRecord.issues} pick={pick} />
                  {!isAdmin ? <p className="admin-tierlist-muted" style={{ marginTop: 'var(--space-4)' }}>{pick('บัญชี editor ยังลบรายการไม่ได้ แต่ยังสลับ public/private และเปิดหน้าจริงเพื่อตรวจสอบได้', 'Editor accounts cannot delete records, but they can still toggle public/private and open the live pages for review.')}</p> : null}
                  {selectedRecord.kind === 'template' && selectedRecord.linkedListCount > 0 ? <p className="admin-tierlist-muted" style={{ marginTop: 'var(--space-4)' }}>{pick('เทมเพลตที่มีลิสต์ผูกอยู่จะถูกล็อกปุ่มลบไว้ก่อน เพื่อกัน foreign key พัง', 'Templates with linked lists keep the delete action locked to avoid foreign key breakage.')}</p> : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default AdminTierlists;
