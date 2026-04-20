import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Camera, Copy, Crown, Edit2, EyeOff, ExternalLink, Grid, GripVertical, Loader2, Medal, MessageSquare, Moon, RotateCcw, Save, Settings, Share2, Sliders, Sun, ToggleLeft, Trash2, Trophy, User, X } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfileCommentsData } from '@/features/profile/hooks/useProfileCommentsData';
import { useProfileLibraryTitles } from '@/features/profile/hooks/useProfileLibraryTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { supabase } from '@/shared/lib/supabase';
import {
  getTitleDisplayName,
  normalizeProfilePreferences,
  RECOMMENDATION_LENGTH_OPTIONS,
  RECOMMENDATION_PROGRESS_STATE_OPTIONS,
  RECOMMENDATION_TYPE_OPTIONS,
  TOP_TITLE_TYPE_OPTIONS,
} from '@/features/profile/lib/profileStore';
import {
  formatProfileCommentDate,
  formatProfileDate,
  normalizeProfileUsername,
  PROFILE_LENGTH_LABELS,
  PROFILE_PROGRESS_LABELS,
  PROFILE_TOP_SECTION_COPY,
  PROFILE_TYPE_LABELS,
  PROFILE_USERNAME_REGEX,
  uniqProfileIds,
} from '@/features/profile/lib/profilePageUtils';
import { LIST_STATUS_OPTIONS, getLocalizedLabel, getLocalizedMoodName, getMoodOptionsForAgeGate } from '@/shared/data/moods';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { AchievementBadges } from '@/features/profile/components/AchievementBadges';
import { fetchFollowState } from '@/features/social/api/socialApi';
import { useSocialActivityFeed } from '@/features/social/hooks/useSocialFeed';
import { FollowListModal } from '@/features/social/components/FollowListModal';
import '../styles/Profile.css';

const PAGE_SIZE = 8;

export function Profile() {
  const { user, isLoading: isAuthLoading, updateUserProfile } = useAuth();
  const { watchlist, watchlistTitles } = useWatchlist();
  const { prefs: storedPrefs, savePreferences } = useProfilePreferences();
  const { hiddenTitleIds, getHiddenEntry, setHiddenScopes, unhideTitle, bulkUnhideTitles, error: hiddenTitlesError } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  const { theme, toggleTheme } = useTheme();
  const { language, t } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const selectableMoods = useMemo(() => getMoodOptionsForAgeGate(showAdult), [showAdult]);
  const profile = user?.profile || {};
  const userId = user?.id || null;
  const initialName = profile.name || user?.user_metadata?.username || user?.email?.split('@')[0] || '';
  const initialAvatarUrl = profile.avatar_url || '';

  const [activeTab, setActiveTab] = useState('overview');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [hiddenPage, setHiddenPage] = useState(1);
  const [selectedHidden, setSelectedHidden] = useState([]);
  const [isBulkUnhiding, setIsBulkUnhiding] = useState(false);
  const [shareForm, setShareForm] = useState({
    username: normalizeProfileUsername(profile.username || ''),
    isProfilePublic: Boolean(profile.is_profile_public),
    allowProfileComments: profile.allow_profile_comments !== false,
  });
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [isSharingProfile, setIsSharingProfile] = useState(false);
  const [profileCommentDraft, setProfileCommentDraft] = useState('');
  const [profileCommentSuccess, setProfileCommentSuccess] = useState('');
  const [isSubmittingProfileComment, setIsSubmittingProfileComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState('');
  const [form, setForm] = useState({ name: initialName, avatarUrl: initialAvatarUrl });
  const [prefsDraft, setPrefsDraft] = useState(() => normalizeProfilePreferences(storedPrefs));
  const [dragState, setDragState] = useState({ typeId: '', fromIndex: -1, overIndex: -1 });

  useEffect(() => setForm({ name: initialName, avatarUrl: initialAvatarUrl }), [initialAvatarUrl, initialName]);
  useEffect(() => setPrefsDraft(normalizeProfilePreferences(storedPrefs)), [storedPrefs]);
  useEffect(() => {
    setShareForm({
      username: normalizeProfileUsername(profile.username || ''),
      isProfilePublic: Boolean(profile.is_profile_public),
      allowProfileComments: profile.allow_profile_comments !== false,
    });
    setShareError('');
    setShareSuccess('');
  }, [profile.is_profile_public, profile.username]);

  const watchStats = useMemo(() => watchlist.reduce((acc, item) => {
    acc.total += 1;
    acc[item.status] = (acc[item.status] || 0) + 1;
    if (item.status === 'completed' || item.status === 'dropped') acc.seen += 1;
    return acc;
  }, { total: 0, seen: 0, planned: 0, watching: 0, reading: 0, completed: 0, dropped: 0, 'on-hold': 0 }), [watchlist]);

  const profileCompletion = useMemo(() => {
    let score = 0;
    if (form.name.trim()) score += 1;
    if ((prefsDraft.bio || '').trim()) score += 1;
    if (prefsDraft.favoriteMoods.length) score += 1;
    if (watchStats.total > 0) score += 1;
    return Math.round((score / 4) * 100);
  }, [form.name, prefsDraft.bio, prefsDraft.favoriteMoods.length, watchStats.total]);

  const continueIds = useMemo(() => watchlist
    .filter((item) => item.status === 'watching' || item.status === 'reading')
    .sort((a, b) => new Date(b.lastConsumedAt || b.updatedAt || b.addedAt || 0) - new Date(a.lastConsumedAt || a.updatedAt || a.addedAt || 0))
    .slice(0, 4)
    .map((item) => item.titleId), [watchlist]);

  const topIds = useMemo(
    () => uniqProfileIds(...TOP_TITLE_TYPE_OPTIONS.map((typeId) => prefsDraft.topTitles?.[typeId] || [])),
    [prefsDraft.topTitles]
  );

  const lookupIds = useMemo(
    () => uniqProfileIds(continueIds, topIds, activeTab === 'settings' ? hiddenTitleIds : []),
    [activeTab, continueIds, topIds, hiddenTitleIds]
  );
  const {
    libraryTitles,
    isLibraryLoading,
    libraryError,
  } = useProfileLibraryTitles(lookupIds, t);
  const {
    profileComments,
    setProfileComments,
    isProfileCommentsLoading,
    profileCommentError,
    setProfileCommentError,
  } = useProfileCommentsData(userId, t);

  const titleMap = useMemo(() => {
    const next = new Map((watchlistTitles || []).map((title) => [title.id, title]));
    libraryTitles.forEach((title) => next.set(title.id, title));
    return next;
  }, [libraryTitles, watchlistTitles]);

  const hiddenTitles = useMemo(
    () => filterTitlesForAgeGate(hiddenTitleIds.map((id) => titleMap.get(id)).filter(Boolean), showAdult),
    [hiddenTitleIds, showAdult, titleMap]
  );
  const topSections = useMemo(() => TOP_TITLE_TYPE_OPTIONS.map((typeId) => ({
    typeId,
    titles: filterTitlesForAgeGate((prefsDraft.topTitles?.[typeId] || []).map((id, index) => {
      const title = titleMap.get(id);
      return title ? { ...title, _rank: index + 1, _typeLabel: PROFILE_TYPE_LABELS[typeId]?.[language] || typeId } : null;
    }).filter(Boolean), showAdult),
  })), [language, prefsDraft.topTitles, showAdult, titleMap]);

  const totalPinnedTopTitles = useMemo(
    () => topSections.reduce((count, section) => count + section.titles.length, 0),
    [topSections]
  );
  const getTypeLabel = (typeId) => PROFILE_TYPE_LABELS[typeId]?.[language] || typeId;

  const hiddenPages = Math.max(1, Math.ceil(hiddenTitles.length / PAGE_SIZE));
  useEffect(() => setHiddenPage((page) => Math.min(page, hiddenPages)), [hiddenPages]);
  useEffect(() => setSelectedHidden((current) => current.filter((id) => hiddenTitleIds.includes(id))), [hiddenTitleIds]);

  const pagedHiddenTitles = useMemo(
    () => hiddenTitles.slice((hiddenPage - 1) * PAGE_SIZE, hiddenPage * PAGE_SIZE),
    [hiddenTitles, hiddenPage]
  );

  const prefsDirty = JSON.stringify(normalizeProfilePreferences(prefsDraft)) !== JSON.stringify(normalizeProfilePreferences(storedPrefs));
  const userInitial = (form.name || user?.email || 'M').charAt(0).toUpperCase();

  const tier = useMemo(() => {
    const n = watchStats.total;
    if (n >= 500) return { key: 'legend',    icon: '✨', th: 'ตำนาน',       en: 'Legend' };
    if (n >= 200) return { key: 'diamond',   icon: '💎', th: 'ไดมอนด์',      en: 'Diamond' };
    if (n >= 100) return { key: 'platinum',  icon: '🏆', th: 'แพลทินัม',    en: 'Platinum' };
    if (n >= 50)  return { key: 'gold',      icon: '🥇', th: 'โกลด์',        en: 'Gold' };
    if (n >= 20)  return { key: 'silver',    icon: '🥈', th: 'ซิลเวอร์',    en: 'Silver' };
    if (n >= 5)   return { key: 'bronze',    icon: '🥉', th: 'บรอนซ์',      en: 'Bronze' };
    return                 { key: 'rookie',  icon: '🌱', th: 'มือใหม่',     en: 'Rookie' };
  }, [watchStats.total]);

  const favoriteMoodObjects = useMemo(() => {
    const idSet = new Set(prefsDraft.favoriteMoods || []);
    return selectableMoods.filter((mood) => idSet.has(mood.id));
  }, [prefsDraft.favoriteMoods, selectableMoods]);

  const completionRatio = watchStats.total
    ? Math.round((watchStats.completed / watchStats.total) * 100)
    : 0;

  const topTypeGroups = useMemo(
    () => topSections.filter((section) => section.titles.length > 0),
    [topSections]
  );

  const [followSummary, setFollowSummary] = useState({ followersCount: 0, followingCount: 0 });
  const [followListKind, setFollowListKind] = useState(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchFollowState(userId, null)
      .then((summary) => { if (!cancelled) setFollowSummary({ followersCount: summary.followersCount, followingCount: summary.followingCount }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const { data: activityData } = useSocialActivityFeed(userId);
  const activityItems = activityData?.feed ?? [];
  const activityTitleMap = activityData?.titleMap ?? new Map();

  const [openTopType, setOpenTopType] = useState(null);
  const activeTopGroup = useMemo(
    () => topTypeGroups.find((section) => section.typeId === openTopType) || null,
    [openTopType, topTypeGroups]
  );

  useEffect(() => {
    if (!activeTopGroup) return;
    const onKey = (event) => { if (event.key === 'Escape') setOpenTopType(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTopGroup]);
  const normalizedShareUsername = normalizeProfileUsername(shareForm.username);
  const sharePath = normalizedShareUsername ? `/u/${normalizedShareUsername}` : '';
  const shareUrl = typeof window !== 'undefined' && sharePath ? `${window.location.origin}${sharePath}` : '';
  const shareDirty = normalizedShareUsername !== normalizeProfileUsername(profile.username || '')
    || shareForm.isProfilePublic !== Boolean(profile.is_profile_public)
    || shareForm.allowProfileComments !== (profile.allow_profile_comments !== false);

  const setPrefs = (updater) => setPrefsDraft((current) => normalizeProfilePreferences(typeof updater === 'function' ? updater(current) : updater));
  const toggleArray = (field, value, allValues) => setPrefs((current) => {
    const nextValues = current[field].includes(value)
      ? current[field].filter((item) => item !== value)
      : [...current[field], value];
    return { ...current, [field]: nextValues.length ? nextValues : [...allValues] };
  });

  const validateShareSettings = () => {
    if (!normalizedShareUsername) {
      return t('profile.shareUsernameRequired');
    }

    if (!PROFILE_USERNAME_REGEX.test(normalizedShareUsername)) {
      return t('profile.shareUsernameInvalid');
    }

    return '';
  };

  const saveShareSettings = async () => {
    setShareError('');
    setShareSuccess('');

    const validationError = validateShareSettings();
    if (validationError) {
      setShareError(validationError);
      return false;
    }

    setIsSavingShare(true);
    try {
      await updateUserProfile({
        username: normalizedShareUsername,
        is_profile_public: shareForm.isProfilePublic,
        allow_profile_comments: shareForm.allowProfileComments,
      });
      setShareSuccess(t('profile.shareSaved'));
      toast.success(t('profile.shareSaved'));
      return true;
    } catch (error) {
      if (error?.code === '23505') {
        setShareError(t('profile.shareUsernameTaken'));
        return false;
      }
      setShareError(t('profile.shareSaveFailed'));
      return false;
    } finally {
      setIsSavingShare(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    if (!navigator?.clipboard?.writeText) {
      throw new Error('Clipboard unavailable');
    }
    await navigator.clipboard.writeText(shareUrl);
  };

  const shareProfile = async () => {
    setShareError('');
    setShareSuccess('');

    const validationError = validateShareSettings();
    if (validationError) {
      setShareError(validationError);
      return;
    }

    if (!shareForm.isProfilePublic) {
      setShareError(t('profile.shareNeedsPublic'));
      return;
    }

    setIsSharingProfile(true);

    try {
      if (shareDirty) {
        const saved = await saveShareSettings();
        if (!saved) return;
      }

      if (!shareUrl) {
        setShareError(t('profile.shareSaveFailed'));
        return;
      }

      const sharePayload = {
        title: t('profile.shareTitle'),
        text: t('profile.shareMessage', { name: form.name || initialName || normalizedShareUsername }),
        url: shareUrl,
      };

      if (navigator.share) {
        await navigator.share(sharePayload);
      } else {
        await copyShareUrl();
      }

      setShareSuccess(t('profile.shareCopied'));
      toast.success(t('profile.shareCopied'));
    } catch {
      setShareError(t('profile.shareFailed'));
    } finally {
      setIsSharingProfile(false);
    }
  };

  const submitProfileComment = async (event) => {
    event.preventDefault();
    if (!userId || !supabase) return;

    const commentBody = String(profileCommentDraft || '').trim();
    if (!commentBody) {
      setProfileCommentError(t('profile.profileCommentRequired'));
      setProfileCommentSuccess('');
      return;
    }
    if (commentBody.length > 500) {
      setProfileCommentError(t('profile.profileCommentTooLong'));
      setProfileCommentSuccess('');
      return;
    }

    setIsSubmittingProfileComment(true);
    setProfileCommentError('');
    setProfileCommentSuccess('');

    try {
      const { data, error } = await supabase
        .from('profile_comments')
        .insert({
          profile_user_id: userId,
          author_user_id: userId,
          comment_body: commentBody,
        })
        .select(`
          id,
          comment_body,
          created_at,
          author_user_id,
          author_profile:user_profiles!profile_comments_author_user_id_fkey(id, name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      setProfileComments((current) => [data, ...current]);
      setProfileCommentDraft('');
      setProfileCommentSuccess(t('profile.profileCommentPosted'));
    } catch {
      setProfileCommentError(t('profile.profileCommentPostFailed'));
    } finally {
      setIsSubmittingProfileComment(false);
    }
  };

  const deleteProfileComment = async (commentId) => {
    if (!commentId || !supabase) return;
    const confirmed = window.confirm(
      language === 'th'
        ? 'ลบคอมเมนต์นี้ใช่ไหม?'
        : 'Delete this comment?'
    );
    if (!confirmed) return;

    setDeletingCommentId(commentId);
    setProfileCommentError('');
    setProfileCommentSuccess('');
    try {
      const { error } = await supabase
        .from('profile_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      setProfileComments((current) => current.filter((entry) => entry.id !== commentId));
      setProfileCommentSuccess(t('profile.profileCommentDeleted'));
    } catch {
      setProfileCommentError(t('profile.profileCommentDeleteFailed'));
    } finally {
      setDeletingCommentId('');
    }
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await updateUserProfile({ name: form.name.trim() || initialName, avatar_url: form.avatarUrl.trim() || null });
      await savePreferences(prefsDraft);
      toast.success(t('profile.profileUpdated'));
      setIsEditOpen(false);
    } catch {
      toast.error(t('profile.profileUpdateFailed'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !userId || !supabase) return;

    setIsUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (!data?.publicUrl) throw new Error('No avatar URL');
      const nextUrl = `${data.publicUrl}?t=${Date.now()}`;
      setForm((current) => ({ ...current, avatarUrl: nextUrl }));
      await updateUserProfile({ avatar_url: nextUrl });
      toast.success(t('profile.avatarUploaded'));
    } catch {
      toast.error(t('profile.avatarUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const savePrefs = async () => {
    setIsSavingPrefs(true);
    try {
      await savePreferences(prefsDraft);
      toast.success(t('profile.preferencesSaved'));
    } catch {
      toast.error(t('profile.preferencesSaveFailed'));
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const rebuildRecommendations = async () => {
    setIsRebuilding(true);
    try {
      await updateUserProfile({ last_rebuilt_at: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('moodtoon:recommendations-rebuild'));
      toast.success(t('profile.rebuildSuccess'));
    } catch {
      toast.error(t('profile.rebuildFailed'));
    } finally {
      setIsRebuilding(false);
    }
  };

  const toggleHiddenScope = async (titleId, key) => {
    const entry = getHiddenEntry(titleId);
    if (!entry) return;

    try {
      await setHiddenScopes(titleId, {
        hideFromRecommendations: key === 'recommendations' ? !entry.hideFromRecommendations : entry.hideFromRecommendations,
        hideFromDiscovery: key === 'discovery' ? !entry.hideFromDiscovery : entry.hideFromDiscovery,
      });
      toast.success(t('profile.hiddenScopeUpdated'));
    } catch {
      toast.error(t('profile.hiddenScopeUpdateFailed'));
    }
  };

  const bulkUnhide = async () => {
    if (!selectedHidden.length) return;
    setIsBulkUnhiding(true);
    try {
      await bulkUnhideTitles(selectedHidden);
      setSelectedHidden([]);
      toast.success(t('profile.updatedSelectedHiddenTitles'));
    } catch {
      toast.error(t('profile.bulkUnhideFailed'));
    } finally {
      setIsBulkUnhiding(false);
    }
  };

  const reorderTopTitles = async (typeId, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    const currentIds = [...(prefsDraft.topTitles?.[typeId] || [])];
    if (!currentIds.length || fromIndex >= currentIds.length || toIndex >= currentIds.length) return;

    const [movedId] = currentIds.splice(fromIndex, 1);
    currentIds.splice(toIndex, 0, movedId);

    const previousPrefs = normalizeProfilePreferences(prefsDraft);
    const nextPrefs = normalizeProfilePreferences({
      ...prefsDraft,
      topTitles: {
        ...prefsDraft.topTitles,
        [typeId]: currentIds,
      },
    });

    setPrefsDraft(nextPrefs);

    try {
      await savePreferences(nextPrefs);
    } catch {
      setPrefsDraft(previousPrefs);
      toast.error(language === 'th' ? '\u0e08\u0e31\u0e14\u0e2d\u0e31\u0e19\u0e14\u0e31\u0e1a\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08' : 'Could not save the new order.');
    }
  };

  const onDragStartTopTitle = (typeId, index) => {
    setDragState({ typeId, fromIndex: index, overIndex: index });
  };

  const onDragOverTopTitle = (event, typeId, index) => {
    if (dragState.typeId !== typeId) return;
    event.preventDefault();
    if (dragState.overIndex !== index) {
      setDragState((current) => ({ ...current, overIndex: index }));
    }
  };

  const onDropTopTitle = async (event, typeId, index) => {
    event.preventDefault();
    const { typeId: dragTypeId, fromIndex } = dragState;
    setDragState({ typeId: '', fromIndex: -1, overIndex: -1 });
    if (dragTypeId !== typeId) return;
    await reorderTopTitles(typeId, fromIndex, index);
  };

  const onDragEndTopTitle = () => {
    setDragState({ typeId: '', fromIndex: -1, overIndex: -1 });
  };

  const renderRankAdornment = (rank) => {
    if (rank === 1) {
      return (
        <span className="profile-rank-badge top">
          <Crown size={14} />
          <span>#1</span>
        </span>
      );
    }

    return (
      <span className="profile-rank-badge">
        <Medal size={14} />
        <span>#{rank}</span>
      </span>
    );
  };

  if (isAuthLoading) {
    return <section className="section"><div className="container profile-loading"><Loader2 size={40} className="animate-spin" /></div></section>;
  }

  return (
    <div className="profile-page animate-fade-in">
      <section className="section">
        <div className="container">
          {/* ── Editorial hero (MoodsWatch mockup style) ── */}
          <div className="profile-hero-mw">
            <div className="profile-mw-avatar-wrap">
              <div className="profile-mw-avatar-ring">
                <div className="profile-mw-avatar-inner">
                  {form.avatarUrl
                    ? <img src={form.avatarUrl} alt="" className="profile-mw-avatar-img" />
                    : <div className="profile-mw-avatar-img profile-mw-avatar-fallback">{userInitial}</div>}
                </div>
              </div>
              <button type="button" className="profile-mw-avatar-edit" onClick={() => setIsEditOpen(true)} aria-label={t('profile.editProfile')}>
                <Camera size={13} />
              </button>
            </div>

            <div className="profile-mw-identity">
              <div className="profile-mw-handle-row">
                <h1 className="profile-mw-handle">{form.name || initialName || user?.email}</h1>
                <Button size="sm" variant="secondary" icon={<Edit2 size={13} />} onClick={() => setIsEditOpen(true)}>
                  {t('profile.editProfile')}
                </Button>
                <button type="button" className="profile-mw-gear-btn" onClick={() => setActiveTab('settings')} title={t('profile.preferences')}>
                  <Settings size={17} />
                </button>
              </div>

              <div className="profile-mw-stats">
                {[
                  { value: watchStats.total,               label: language === 'th' ? 'เรื่อง' : 'titles', onClick: null },
                  { value: followSummary.followersCount,   label: language === 'th' ? 'ผู้ติดตาม' : 'followers', onClick: () => setFollowListKind('followers') },
                  { value: followSummary.followingCount,   label: language === 'th' ? 'กำลังติดตาม' : 'following', onClick: () => setFollowListKind('following') },
                  { value: watchStats.completed,           label: t('profile.completed'), onClick: null },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`profile-mw-stat${s.onClick ? ' is-clickable' : ''}`}
                    onClick={s.onClick || undefined}
                    role={s.onClick ? 'button' : undefined}
                    tabIndex={s.onClick ? 0 : undefined}
                    onKeyDown={s.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onClick(); } } : undefined}
                  >
                    <strong>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>

              <div className="profile-mw-bio">
                {prefsDraft.bio
                  ? <p>{prefsDraft.bio}</p>
                  : <p className="profile-mw-bio-placeholder">{t('profile.profileFallbackBio')}</p>}
                <span className="profile-mw-meta">
                  {t('profile.memberSince', { date: formatProfileDate(profile.created_at || user?.created_at, locale) })}
                </span>
                <div className="profile-mw-pills">
                  <span className="profile-mw-pill tier">{tier.icon} {language === 'th' ? tier.th : tier.en}</span>
                  {watchStats.total > 0 && (
                    <span className="profile-mw-pill rate">★ {completionRatio}% {language === 'th' ? 'ดูจบ' : 'completed'}</span>
                  )}
                  {favoriteMoodObjects.length > 0 && (
                    <span className="profile-mw-pill mood">{favoriteMoodObjects.length} {language === 'th' ? 'มู้ดที่ชอบ' : 'favorite moods'}</span>
                  )}
                  <span className="profile-mw-pill neutral">{profileCompletion}% {language === 'th' ? 'โปรไฟล์' : 'profile'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Highlights strip: top-5 groups + favorite moods ── */}
          {(favoriteMoodObjects.length > 0 || topTypeGroups.length > 0) && (
            <div className="profile-mw-highlights">
              {topTypeGroups.map((section) => {
                const leadTitle = section.titles[0];
                const typeIcon = section.typeId === 'anime' ? '📺' : section.typeId === 'manga' ? '📖' : section.typeId === 'manhwa' ? '📱' : '🏆';
                return (
                  <button
                    type="button"
                    key={`group-${section.typeId}`}
                    className="profile-mw-highlight is-top"
                    onClick={() => setOpenTopType(section.typeId)}
                  >
                    <div className="profile-mw-highlight-ring profile-mw-top-ring">
                      <div className="profile-mw-highlight-inner">
                        {leadTitle?.cover
                          ? <img src={leadTitle.cover} alt="" className="profile-mw-highlight-cover" />
                          : <div className="profile-mw-highlight-icon">{typeIcon}</div>}
                      </div>
                      <span className="profile-mw-medal profile-mw-medal-1">🥇</span>
                    </div>
                    <div className="profile-mw-highlight-label">
                      {language === 'th' ? 'Top 5 ' : 'Top 5 '}{getTypeLabel(section.typeId)}
                    </div>
                  </button>
                );
              })}
              {favoriteMoodObjects.map((mood) => (
                <div key={mood.id} className="profile-mw-highlight">
                  <div className="profile-mw-highlight-ring" style={{ background: `linear-gradient(135deg, ${mood.color}, var(--rose-500))` }}>
                    <div className="profile-mw-highlight-inner">
                      <div className="profile-mw-highlight-icon">{mood.icon}</div>
                    </div>
                  </div>
                  <div className="profile-mw-highlight-label">{getLocalizedMoodName(mood, language)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Top 5 list modal (per type) ── */}
          {activeTopGroup && (
            <div className="profile-story-backdrop" onClick={() => setOpenTopType(null)}>
              <button
                type="button"
                className="profile-story-close"
                onClick={(event) => { event.stopPropagation(); setOpenTopType(null); }}
                aria-label={t('common.close')}
              >
                <X size={22} />
              </button>
              <article className="profile-top5-card" onClick={(event) => event.stopPropagation()}>
                <header className="profile-top5-header">
                  <div className="profile-top5-kicker">
                    {language === 'th' ? 'อันดับเรื่องโปรด' : 'Top pick'}
                  </div>
                  <h2 className="profile-top5-title">
                    Top 5 <span className="profile-top5-title-accent">{getTypeLabel(activeTopGroup.typeId)}</span>
                  </h2>
                </header>
                <ol className="profile-top5-list">
                  {activeTopGroup.titles.map((title) => {
                    const rank = title._rank;
                    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                    return (
                      <li key={title.id} className={`profile-top5-item profile-top5-rank-${rank}`}>
                        <div className={`profile-top5-medal profile-top5-medal-${rank}`}>
                          {rankIcon ? <span className="profile-top5-medal-emoji">{rankIcon}</span> : <span className="profile-top5-medal-num">#{rank}</span>}
                        </div>
                        {title.cover
                          ? <img src={title.cover} alt="" className="profile-top5-cover" />
                          : <div className="profile-top5-cover profile-top5-cover-fallback">{getTitleDisplayName(title).charAt(0)}</div>}
                        <div className="profile-top5-copy">
                          <strong>{getTitleDisplayName(title)}</strong>
                          <div className="profile-top5-meta">
                            {title.year ? <span>{title.year}</span> : null}
                            {title.score ? <span>★ {title.score}</span> : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </article>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="profile-tabs-ig">
            <button type="button" className={`profile-tab-ig ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
              <Grid size={15} /><span>{t('profile.librarySummary')}</span>
            </button>
            <button type="button" className={`profile-tab-ig ${activeTab === 'top5' ? 'active' : ''}`} onClick={() => setActiveTab('top5')}>
              <Trophy size={15} /><span>Top 5</span>
              <span className="profile-tab-ig-count">{totalPinnedTopTitles}</span>
            </button>
            <button type="button" className={`profile-tab-ig ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              <Settings size={15} /><span>{t('profile.preferences')}</span>
            </button>
          </div>

          {(libraryError || (activeTab === 'settings' ? hiddenTitlesError : '')) && (
            <div className="profile-inline-error">{libraryError || hiddenTitlesError}</div>
          )}

          {activeTab === 'overview' ? (
            <div className="profile-content-grid">
              {/* Dashboard: taste card + stat tiles */}
              <div className="profile-mw-dashboard">
                <div className="profile-mw-taste-card">
                  <div className="profile-mw-taste-kicker">{language === 'th' ? 'รสนิยมของคุณ' : 'Your taste'}</div>
                  <div className="profile-mw-taste-quote">
                    {prefsDraft.bio
                      ? `"${prefsDraft.bio}"`
                      : (language === 'th' ? '"เล่าหน่อยว่าคุณชอบดูอะไรแบบไหน"' : '"tell us what you love to watch"')}
                  </div>
                  {favoriteMoodObjects.length > 0 && (
                    <div className="profile-mw-taste-chips">
                      {favoriteMoodObjects.slice(0, 6).map((mood) => (
                        <span key={mood.id} className="profile-mw-taste-chip" style={{ background: `${mood.color}22`, color: mood.color }}>
                          <span>{mood.icon}</span>
                          <span>{getLocalizedMoodName(mood, language)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {[
                  { value: watchStats.total, label: language === 'th' ? 'เรื่องทั้งหมด' : 'Titles watched' },
                  { value: watchStats.watching + watchStats.reading, label: language === 'th' ? 'กำลังดู' : 'In progress' },
                  { value: watchStats.completed, label: language === 'th' ? 'ดูจบแล้ว' : 'Completed' },
                  { value: `${completionRatio}%`, label: language === 'th' ? 'อัตราดูจบ' : 'Completion rate' },
                ].map((s) => (
                  <div key={s.label} className="profile-mw-stat-tile">
                    <div className="profile-mw-stat-value">{s.value}</div>
                    <div className="profile-mw-stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="profile-mw-overview-grid">
                <div className="profile-mw-overview-main">
                  <section className="profile-mw-section">
                    <header className="profile-mw-section-head">
                      <div>
                        <div className="profile-mw-section-kicker">{language === 'th' ? 'แวดวงของคุณ' : 'Your circle'}</div>
                        <h2 className="profile-mw-section-title">
                          {language === 'th' ? 'เพื่อนกำลัง' : 'What your friends are '}
                          <span className="profile-mw-section-accent">{language === 'th' ? 'ทำอะไรอยู่' : 'up to'}</span>
                        </h2>
                      </div>
                      {activityItems.length > 5 && (
                        <Link to="/feed" className="profile-mw-section-link">{language === 'th' ? 'ดูทั้งหมด →' : 'See all →'}</Link>
                      )}
                    </header>
                    {activityItems.length > 0 ? (
                      <div className="profile-mw-activity-card">
                        {activityItems.slice(0, 5).map((item) => {
                          const title = item.title_id ? activityTitleMap.get(item.title_id) : null;
                          const actorName = item.actor_name || item.actor_username || t('profile.publicCommentAnonymous');
                          const initial = actorName.charAt(0).toUpperCase();
                          const score = item.metadata?.score;
                          const verb = {
                            added: language === 'th' ? 'เพิ่มลิสต์' : 'added',
                            completed: language === 'th' ? 'ดูจบ' : 'just finished',
                            dropped: language === 'th' ? 'ดรอป' : 'dropped',
                            rated: language === 'th' ? `ให้คะแนน ${score ?? '?'}` : `rated ${score ?? '?'}`,
                            reviewed: language === 'th' ? 'รีวิว' : 'reviewed',
                            followed: language === 'th' ? 'ติดตาม' : 'followed',
                          }[item.action_type] || item.action_type;
                          return (
                            <div key={item.id} className="profile-mw-activity-row">
                              <div className="profile-mw-activity-avatar">
                                {item.actor_avatar_url
                                  ? <img src={item.actor_avatar_url} alt="" />
                                  : <div className="profile-mw-activity-avatar-fallback">{initial}</div>}
                              </div>
                              <div className="profile-mw-activity-body">
                                <div className="profile-mw-activity-text">
                                  {item.actor_username
                                    ? <Link to={`/u/${item.actor_username}`}><strong>{actorName}</strong></Link>
                                    : <strong>{actorName}</strong>}
                                  {' '}{verb}{' '}
                                  {title && (
                                    <Link to={`/title/${title.slug}`} className="profile-mw-activity-title-link">{getTitleDisplayName(title)}</Link>
                                  )}
                                  {item.action_type === 'followed' && item.metadata?.followed_username && (
                                    <Link to={`/u/${item.metadata.followed_username}`} className="profile-mw-activity-title-link">{item.metadata.followed_username}</Link>
                                  )}
                                  <span className="profile-mw-activity-time">· {formatProfileCommentDate(item.created_at, locale)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="profile-mw-activity-empty">
                        <p>{language === 'th' ? 'ยังไม่มีความเคลื่อนไหว ลองไปติดตามเพื่อนเพิ่มสิ!' : 'No activity yet. Follow friends to see their moves here.'}</p>
                        <Link to="/feed" className="profile-mw-section-link">{language === 'th' ? 'ไปที่ฟีด →' : 'Go to feed →'}</Link>
                      </div>
                    )}
                  </section>
                </div>

                <div className="profile-mw-overview-side">
                  <AchievementBadges variant="mw" />
                </div>
              </div>

              {/* Steam-style wall comments (full width, bottom) */}
              <section className="profile-mw-wall">
                <header className="profile-mw-wall-head">
                  <div>
                    <div className="profile-mw-section-kicker">{language === 'th' ? 'วอลล์โปรไฟล์' : 'Profile wall'}</div>
                    <h2 className="profile-mw-section-title">
                      {language === 'th' ? 'คอมเมนต์' : 'Comments'}
                      <span className="profile-mw-wall-count">{profileComments.length}</span>
                    </h2>
                  </div>
                </header>

                <form className="profile-mw-wall-form" onSubmit={submitProfileComment}>
                  <textarea
                    id="profile-comment-input"
                    value={profileCommentDraft}
                    onChange={(event) => {
                      setProfileCommentDraft(event.target.value);
                      setProfileCommentError('');
                      setProfileCommentSuccess('');
                    }}
                    placeholder={t('profile.profileCommentPlaceholder')}
                    maxLength={500}
                    rows={2}
                  />
                  <div className="profile-mw-wall-form-row">
                    <small>{profileCommentDraft.length}/500</small>
                    {profileCommentError ? <span className="profile-field-error" style={{ padding: 0, border: 'none', background: 'transparent' }}>{profileCommentError}</span> : null}
                    {profileCommentSuccess ? <span className="profile-field-success" style={{ padding: 0, border: 'none', background: 'transparent' }}>{profileCommentSuccess}</span> : null}
                    <Button type="submit" size="sm" icon={isSubmittingProfileComment ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />} disabled={isSubmittingProfileComment}>
                      {isSubmittingProfileComment ? t('profile.profileCommentPosting') : t('profile.profileCommentPost')}
                    </Button>
                  </div>
                </form>

                {isProfileCommentsLoading ? (
                  <div className="profile-empty-state">
                    <Loader2 size={20} className="animate-spin" />
                    <span>{t('profile.profileCommentsLoading')}</span>
                  </div>
                ) : profileComments.length > 0 ? (
                  <ul className="profile-mw-wall-list">
                    {profileComments.map((entry) => {
                      const author = entry.author_profile || {};
                      const authorName = author.name || author.username || t('profile.publicCommentAnonymous');
                      const authorInitial = authorName.charAt(0).toUpperCase();
                      return (
                        <li key={entry.id} className="profile-mw-wall-item">
                          <div className="profile-mw-wall-avatar">
                            {author.avatar_url
                              ? <img src={author.avatar_url} alt="" />
                              : <div className="profile-mw-wall-avatar-fallback">{authorInitial}</div>}
                          </div>
                          <div className="profile-mw-wall-body">
                            <div className="profile-mw-wall-meta">
                              <strong>{authorName}</strong>
                              <span>{formatProfileCommentDate(entry.created_at, locale)}</span>
                            </div>
                            <p>{entry.comment_body}</p>
                          </div>
                          <button
                            type="button"
                            className="profile-mw-wall-delete"
                            onClick={() => deleteProfileComment(entry.id)}
                            disabled={deletingCommentId === entry.id}
                            aria-label={t('profile.profileCommentDelete')}
                          >
                            {deletingCommentId === entry.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="profile-mw-wall-empty">
                    <span>{t('profile.profileCommentsEmpty')}</span>
                  </div>
                )}
              </section>

            </div>
          ) : activeTab === 'top5' ? (
            <div className="profile-content-grid">
              <article className="profile-section-card profile-top-stage">
                <div className="profile-section-heading">
                  <div>
                    <h2>{PROFILE_TOP_SECTION_COPY.overviewTitle[language]}</h2>
                    <p>{PROFILE_TOP_SECTION_COPY.overviewSubtitle[language]}</p>
                  </div>
                </div>

                {isLibraryLoading ? (
                  <div className="profile-empty-state">
                    <Loader2 size={20} className="animate-spin" />
                    <span>{PROFILE_TOP_SECTION_COPY.loading[language]}</span>
                  </div>
                ) : (
                  <div className="profile-top-showcase-shell compact">
                    <div className="profile-top-overview-meta">
                      <strong>{language === 'th' ? `ปักแล้ว ${totalPinnedTopTitles} เรื่อง` : `${totalPinnedTopTitles} titles pinned`}</strong>
                      <span>{PROFILE_TOP_SECTION_COPY.emptyHint[language]}</span>
                    </div>
                    <div className="profile-top-sections structured compact">
                      {topSections.map((section) => (
                        <section key={section.typeId} className="profile-top-block">
                          <div className="profile-subheading profile-top-block-heading">
                            <div>
                              <span>{getTypeLabel(section.typeId)}</span>
                              <p>{PROFILE_TOP_SECTION_COPY.sectionHint[language]}</p>
                            </div>
                            <strong>{section.titles.length} / 5</strong>
                          </div>
                          {section.titles.length > 0 ? (
                            <div className="profile-top-list">
                              {section.titles.map((title) => (
                                <div
                                  key={title.id}
                                  className={`profile-top-item shelf ${dragState.typeId === section.typeId && dragState.fromIndex === title._rank - 1 ? 'is-dragging' : ''} ${dragState.typeId === section.typeId && dragState.overIndex === title._rank - 1 ? 'is-drop-target' : ''}`}
                                  draggable
                                  onDragStart={() => onDragStartTopTitle(section.typeId, title._rank - 1)}
                                  onDragOver={(event) => onDragOverTopTitle(event, section.typeId, title._rank - 1)}
                                  onDrop={(event) => onDropTopTitle(event, section.typeId, title._rank - 1)}
                                  onDragEnd={onDragEndTopTitle}
                                >
                                  <span className="profile-drag-handle" aria-hidden="true">
                                    <GripVertical size={16} />
                                  </span>
                                  <div className="profile-top-item-copy">
                                    <img src={title.cover} alt="" className="profile-top-item-thumb" />
                                    <div>
                                      {renderRankAdornment(title._rank)}
                                      <strong>{getTitleDisplayName(title)}</strong>
                                      <span>{title._typeLabel}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="profile-empty-state small profile-shelf-empty-card">
                              <Trophy size={18} />
                              <strong>{PROFILE_TOP_SECTION_COPY.sectionEmptyTitle[language]}</strong>
                              <span>{PROFILE_TOP_SECTION_COPY.sectionEmptyHint[language]}</span>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </div>
          ) : (
            <div className="profile-content-grid">
              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.shareProfileTitle')}</h2>
                    <p>{t('profile.shareProfileHint')}</p>
                  </div>
                </div>

                <div className="profile-form-grid">
                  <label className="profile-field">
                    <span>{t('profile.shareUsernameLabel')}</span>
                    <input
                      type="text"
                      value={shareForm.username}
                      onChange={(event) => {
                        setShareError('');
                        setShareSuccess('');
                        setShareForm((current) => ({ ...current, username: normalizeProfileUsername(event.target.value) }));
                      }}
                      placeholder={t('profile.shareUsernamePlaceholder')}
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <small className="profile-field-hint">{t('profile.shareUsernameHint')}</small>
                  </label>

                  <label className="profile-switch">
                    <input
                      type="checkbox"
                      checked={shareForm.isProfilePublic}
                      onChange={(event) => {
                        setShareError('');
                        setShareSuccess('');
                        setShareForm((current) => ({ ...current, isProfilePublic: event.target.checked }));
                      }}
                    />
                    <span>{t('profile.sharePublicToggle')}</span>
                  </label>

                  <label className="profile-switch">
                    <input
                      type="checkbox"
                      checked={shareForm.allowProfileComments}
                      onChange={(event) => {
                        setShareError('');
                        setShareSuccess('');
                        setShareForm((current) => ({ ...current, allowProfileComments: event.target.checked }));
                      }}
                    />
                    <span>{t('profile.shareCommentsToggle')}</span>
                  </label>

                  <div className="profile-share-link-preview">
                    <span>{t('profile.shareLinkLabel')}</span>
                    <code>{sharePath || t('profile.shareLinkPlaceholder')}</code>
                  </div>

                  {shareError && <p className="profile-field-error">{shareError}</p>}
                  {shareSuccess && <p className="profile-field-success">{shareSuccess}</p>}
                </div>

                <div className="profile-actions-row">
                  <Button
                    icon={isSavingShare ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    onClick={saveShareSettings}
                    disabled={isSavingShare || isSharingProfile}
                  >
                    {isSavingShare ? t('profile.saving') : t('profile.shareSaveButton')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={isSharingProfile ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                    onClick={shareProfile}
                    disabled={isSharingProfile || isSavingShare}
                  >
                    {isSharingProfile ? t('profile.saving') : t('profile.shareNow')}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<Copy size={16} />}
                    onClick={async () => {
                      try {
                        await copyShareUrl();
                        setShareSuccess(t('profile.shareCopied'));
                        setShareError('');
                        toast.success(t('profile.shareCopied'));
                      } catch {
                        setShareError(t('profile.shareFailed'));
                      }
                    }}
                    disabled={!shareUrl || isSharingProfile}
                  >
                    {t('profile.copyLink')}
                  </Button>
                  {sharePath && (
                    <Link to={sharePath} className="profile-inline-link profile-share-open-link" target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      <span>{t('profile.openPublicProfile')}</span>
                    </Link>
                  )}
                </div>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.preferences')}</h2>
                    <p>{t('profile.profileFallbackBio')}</p>
                  </div>
                </div>

                <div className="profile-form-grid">
                  <div className="profile-settings-group">
                    <div className="profile-settings-group-label">
                      <User size={14} />
                      <span>{language === 'th' ? 'เกี่ยวกับคุณ' : 'About You'}</span>
                    </div>
                    <label className="profile-field">
                      <span>{t('profile.bio')}</span>
                      <textarea
                        value={prefsDraft.bio}
                        onChange={(event) => setPrefs((current) => ({ ...current, bio: event.target.value }))}
                        placeholder={t('profile.bioPlaceholder')}
                        rows={4}
                      />
                    </label>
                    <div className="profile-field">
                      <span>{language === 'th' ? 'มู้ดที่ชอบ' : 'Favorite moods'}</span>
                      <div className="profile-chip-group">
                        {selectableMoods.map((mood) => (
                          <button
                            key={mood.id}
                            type="button"
                            className={`profile-chip-btn ${prefsDraft.favoriteMoods.includes(mood.id) ? 'active' : ''}`}
                            onClick={() => toggleArray(
                              'favoriteMoods',
                              mood.id,
                              selectableMoods.map((item) => item.id)
                            )}
                          >
                            <span>{mood.icon}</span>
                            <span>{getLocalizedMoodName(mood, language)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="profile-settings-group">
                    <div className="profile-settings-group-label">
                      <Sliders size={14} />
                      <span>{language === 'th' ? 'ตัวกรองการแนะนำ' : 'Recommendation Filters'}</span>
                    </div>
                    <div className="profile-field">
                      <span>{language === 'th' ? 'ประเภท' : 'Recommendation type'}</span>
                      <div className="profile-chip-group">
                        {RECOMMENDATION_TYPE_OPTIONS.map((typeId) => (
                          <button
                            key={typeId}
                            type="button"
                            className={`profile-chip-btn ${prefsDraft.recommendationTypes.includes(typeId) ? 'active' : ''}`}
                            onClick={() => toggleArray('recommendationTypes', typeId, RECOMMENDATION_TYPE_OPTIONS)}
                          >
                            {getTypeLabel(typeId)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="profile-field">
                      <span>{language === 'th' ? 'สถานะความคืบหน้า' : 'Progress states'}</span>
                      <div className="profile-chip-group">
                        {RECOMMENDATION_PROGRESS_STATE_OPTIONS.map((stateId) => (
                          <button
                            key={stateId}
                            type="button"
                            className={`profile-chip-btn ${prefsDraft.recommendationProgressStates.includes(stateId) ? 'active' : ''}`}
                            onClick={() => toggleArray('recommendationProgressStates', stateId, RECOMMENDATION_PROGRESS_STATE_OPTIONS)}
                          >
                            {getLocalizedLabel(LIST_STATUS_OPTIONS.find((option) => option.id === stateId), language) || PROFILE_PROGRESS_LABELS[stateId]?.[language] || stateId}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="profile-field dual">
                      <label>
                        <span>{language === 'th' ? 'คะแนนขั้นต่ำ' : 'Minimum score'}</span>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={prefsDraft.minRecommendationScore}
                          onChange={(event) => setPrefs((current) => ({ ...current, minRecommendationScore: Number(event.target.value) }))}
                        />
                        <strong>{prefsDraft.minRecommendationScore}/10</strong>
                      </label>
                      <label>
                        <span>{language === 'th' ? 'ความยาว' : 'Length'}</span>
                        <select
                          value={prefsDraft.recommendationLength}
                          onChange={(event) => setPrefs((current) => ({ ...current, recommendationLength: event.target.value }))}
                        >
                          {RECOMMENDATION_LENGTH_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {PROFILE_LENGTH_LABELS[option]?.[language] || option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="profile-settings-group">
                    <div className="profile-settings-group-label">
                      <ToggleLeft size={14} />
                      <span>{language === 'th' ? 'การตั้งค่าด่วน' : 'Quick Settings'}</span>
                    </div>
                    <div className="profile-toggle-list">
                      {[
                        ['hideSeenByDefault', t('home.hideSeenTitles')],
                        ['prioritizeUnseen', language === 'th' ? 'จัดลำดับที่ยังไม่ดูก่อน' : 'Prioritize unseen titles'],
                        ['excludeCompletedFromRecs', language === 'th' ? 'ไม่แนะนำที่ดูจบแล้ว' : 'Exclude completed titles'],
                        ['excludeDroppedFromRecs', language === 'th' ? 'ไม่แนะนำที่ดรอปแล้ว' : 'Exclude dropped titles'],
                        ['hideAdultContent', language === 'th' ? 'ซ่อนเนื้อหาสำหรับผู้ใหญ่' : 'Hide adult content'],
                        ['forceUnseenOnly', language === 'th' ? 'แนะนำแต่ที่ยังไม่ดูเท่านั้น' : 'Force unseen only'],
                      ].map(([key, label]) => (
                        <label key={key} className="profile-switch">
                          <input
                            type="checkbox"
                            checked={prefsDraft[key]}
                            onChange={(event) => setPrefs((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="profile-actions-row">
                  <Button icon={isSavingPrefs ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} onClick={savePrefs} disabled={!prefsDirty || isSavingPrefs}>
                    {isSavingPrefs ? t('profile.saving') : t('profile.savePreferences')}
                  </Button>
                  <Button variant="secondary" icon={isRebuilding ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} onClick={rebuildRecommendations} disabled={isRebuilding}>
                    {t('profile.recommendationActions')}
                  </Button>
                </div>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.hiddenTitles')}</h2>
                    <p>{t('profile.hiddenTitlesCount', { count: hiddenTitles.length })}</p>
                  </div>
                  {selectedHidden.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={bulkUnhide} disabled={isBulkUnhiding}>
                      {isBulkUnhiding ? t('profile.unhiding') : t('profile.bulkUnhide', { count: selectedHidden.length })}
                    </Button>
                  )}
                </div>
                {hiddenTitles.length > 0 ? (
                  <>
                    <div className="profile-hidden-grid">
                      {pagedHiddenTitles.map((title) => {
                        const entry = getHiddenEntry(title.id);
                        const isSelected = selectedHidden.includes(title.id);

                        return (
                          <div key={title.id} className="profile-hidden-card">
                            <label className="profile-check-row">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) => {
                                  setSelectedHidden((current) => (
                                    event.target.checked
                                      ? [...current, title.id]
                                      : current.filter((id) => id !== title.id)
                                  ));
                                }}
                              />
                              <span>{getTitleDisplayName(title)}</span>
                            </label>
                            <div className="profile-hidden-actions">
                              <button type="button" className={`profile-chip-btn ${entry?.hideFromRecommendations ? 'active' : ''}`} onClick={() => toggleHiddenScope(title.id, 'recommendations')}>
                                <EyeOff size={14} />
                                <span>{t('profile.hiddenScopeRecommendations')}</span>
                              </button>
                              <button type="button" className={`profile-chip-btn ${entry?.hideFromDiscovery ? 'active' : ''}`} onClick={() => toggleHiddenScope(title.id, 'discovery')}>
                                <Grid size={14} />
                                <span>{t('profile.hiddenScopeDiscovery')}</span>
                              </button>
                              <Button variant="ghost" size="sm" onClick={() => unhideTitle(title.id)}>
                                {t('profile.unhide')}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hiddenPages > 1 && (
                      <div className="profile-pagination">
                        <Button variant="ghost" size="sm" onClick={() => setHiddenPage((page) => Math.max(1, page - 1))} disabled={hiddenPage <= 1}>
                          {t('common.previous')}
                        </Button>
                        <span>{t('profile.pageIndicator', { page: hiddenPage, total: hiddenPages })}</span>
                        <Button variant="ghost" size="sm" onClick={() => setHiddenPage((page) => Math.min(hiddenPages, page + 1))} disabled={hiddenPage >= hiddenPages}>
                          {t('common.next')}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="profile-empty-state">
                    <span>{t('profile.noHiddenTitles')}</span>
                  </div>
                )}
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.accountBasics')}</h2>
                    <p>{t('profile.theme')}</p>
                  </div>
                </div>

                <div className="profile-account-grid">
                  <div className="profile-account-item">
                    <span>{t('profile.theme')}</span>
                    <strong>{theme === 'dark' ? t('profile.themeDark') : t('profile.themeLight')}</strong>
                  </div>
                  <div className="profile-account-item">
                    <span>{t('profile.role')}</span>
                    <strong>{profile.role || t('profile.roleMember')}</strong>
                  </div>
                  <div className="profile-account-item">
                    <span>{t('profile.joined')}</span>
                    <strong>{formatProfileDate(profile.created_at || user?.created_at, locale)}</strong>
                  </div>
                </div>

                <div className="profile-actions-row">
                  <Button
                    variant="secondary"
                    icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    onClick={toggleTheme}
                  >
                    {t('profile.toggleTheme')}
                  </Button>
                  <Button variant="ghost" onClick={() => setIsEditOpen(true)} icon={<Edit2 size={16} />}>
                    {t('profile.editProfile')}
                  </Button>
                </div>
              </article>
            </div>
          )}
        </div>
      </section>

      {followListKind && (
        <FollowListModal
          profileUserId={userId}
          kind={followListKind}
          onClose={() => setFollowListKind(null)}
        />
      )}

      {isEditOpen && (
        <div className="profile-modal-backdrop" onClick={() => setIsEditOpen(false)}>
          <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <h2>{t('profile.editProfile')}</h2>
                <p>{t('profile.editProfileModalDesc')}</p>
              </div>
              <button type="button" className="profile-modal-close" onClick={() => setIsEditOpen(false)} aria-label={t('common.close')}>
                <X size={18} />
              </button>
            </div>

            <div className="profile-form-grid">
              <section className="profile-modal-avatar-card">
                <div className="profile-modal-avatar-preview">
                  {form.avatarUrl ? (
                    <img src={form.avatarUrl} alt="" className="profile-avatar" />
                  ) : (
                    <div className="profile-avatar profile-avatar-fallback">{userInitial}</div>
                  )}
                </div>
                <div className="profile-modal-avatar-copy">
                  <span className="profile-modal-section-kicker">{t('profile.orUploadAvatar')}</span>
                  <strong>{language === 'th' ? 'อัปเดตรูปโปรไฟล์ของคุณ' : 'Refresh your profile photo'}</strong>
                  <p>
                    {language === 'th'
                      ? 'เลือกภาพใหม่เพื่อใช้แทนรูปเดิม ระบบจะอัปโหลดและตั้งค่าให้อัตโนมัติ'
                      : 'Pick a new image and we will upload it and set it as your avatar automatically.'}
                  </p>
                </div>
                <label className={`profile-upload-button ${isUploadingAvatar ? 'is-uploading' : ''}`}>
                  <Camera size={16} />
                  <span>{isUploadingAvatar ? t('profile.uploadingPhoto') : t('profile.orUploadAvatar')}</span>
                  <input type="file" accept="image/*" onChange={uploadAvatar} disabled={isUploadingAvatar} />
                </label>
              </section>

              <label className="profile-field">
                <span>{t('profile.displayName')}</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t('profile.displayNamePlaceholder')}
                />
              </label>

              <label className="profile-field">
                <span>{t('profile.bio')}</span>
                <textarea
                  value={prefsDraft.bio}
                  onChange={(event) => setPrefs((current) => ({ ...current, bio: event.target.value }))}
                  placeholder={t('profile.bioPlaceholder')}
                  rows={4}
                />
              </label>
            </div>

            <div className="profile-actions-row">
              <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                icon={isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                onClick={saveProfile}
                disabled={isSavingProfile || isUploadingAvatar}
              >
                {isSavingProfile ? t('profile.savingProfile') : t('profile.saveProfile')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
