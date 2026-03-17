import React, { useState, useRef, useCallback } from 'react';
import {
  Download, Play, Square, RefreshCw,
  CheckCircle2, XCircle, SkipForward, Info,
  TrendingUp, Star, Flame, Clock, CalendarDays, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/shared/lib/supabase';
import { MOODS } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';

// ─── Utilities ───────────────────────────────────────────────────────────────

function slugify(v) {
  return String(v || '').toLowerCase().trim().normalize('NFKD')
    .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}
function mapStatus(s) {
  const n = String(s || '').toUpperCase();
  if (['FINISHED', 'COMPLETED', 'COMPLETE', 'ENDED'].includes(n)) return 'completed';
  if (['NOT_YET_RELEASED', 'TBA', 'UPCOMING', 'UNRELEASED'].includes(n)) return 'upcoming';
  if (['HIATUS', 'ON_HIATUS'].includes(n)) return 'hiatus';
  if (['CANCELLED', 'CANCELED'].includes(n)) return 'cancelled';
  return 'ongoing';
}
function inferSubtype({ mediaType, originCountry, sourceHints = [] }) {
  if (mediaType === 'anime') return { type: 'anime', subtype: 'anime' };
  const hints = sourceHints.join(' ').toLowerCase();
  if (originCountry === 'KR' || hints.includes('manhwa') || hints.includes('webtoon'))
    return { type: 'manga', subtype: hints.includes('webtoon') ? 'webtoon' : 'manhwa' };
  if (originCountry === 'CN' || hints.includes('manhua'))
    return { type: 'manga', subtype: 'manhua' };
  return { type: 'manga', subtype: 'manga' };
}
function deriveMoodIds(parts) {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return MOODS.filter((m) => (m.tags || []).some((t) => hay.includes(t.toLowerCase()))).map((m) => m.id);
}
function normalizeMedia(media) {
  const mediaType = media.type === 'ANIME' ? 'anime' : 'manga';
  const { type, subtype } = inferSubtype({
    mediaType, originCountry: media.countryOfOrigin || null,
    sourceHints: [media.format, ...(media.genres || []), ...(media.tags || []).map((t) => t.name)],
  });
  const canonicalTitle = media.title.english || media.title.romaji || media.title.native || `anilist-${media.id}`;
  const slugBase = media.title.english || media.title.romaji || media.title.native || `${type}-${media.id}`;
  const originLanguage = media.countryOfOrigin === 'JP' ? 'ja' : media.countryOfOrigin === 'KR' ? 'ko' : media.countryOfOrigin === 'CN' ? 'zh' : null;
  return {
    anilistId: String(media.id),
    displayTitle: canonicalTitle,
    coverImage: media.coverImage?.large || null,
    canonical: {
      slug: `${slugify(slugBase) || type}-${media.id}`,
      canonical_title: canonicalTitle, type, subtype,
      origin_country: media.countryOfOrigin || null, origin_language: originLanguage,
      status: mapStatus(media.status), release_year: media.seasonYear || null,
      episodes: media.episodes || null, chapters: media.chapters || null,
      volumes: media.volumes || null, duration_minutes: media.duration || null,
      is_adult: Boolean(media.isAdult),
      cover_image: media.coverImage?.extraLarge || media.coverImage?.large || null,
      banner_image: media.bannerImage || null,
      synopsis: media.description || null, avg_score: media.averageScore || null,
      popularity_score: media.popularity || null, last_synced_at: new Date().toISOString(),
    },
    aliases: [
      media.title.english && { alias: media.title.english, language_code: 'en', alias_type: 'english', is_primary: true },
      media.title.romaji && { alias: media.title.romaji, language_code: 'ja-Latn', alias_type: 'romaji', is_primary: !media.title.english },
      media.title.native && { alias: media.title.native, language_code: null, alias_type: 'native', is_primary: false },
      ...(media.synonyms || []).filter(Boolean).map((a) => ({ alias: a, language_code: null, alias_type: 'synonym', is_primary: false })),
    ].filter(Boolean),
    genres: (media.genres || []).map((genre_name) => ({ genre_name })),
    tags: (media.tags || []).map((tag) => ({ tag_name: tag.name, weight: tag.rank || null, source_provider: 'anilist' })),
    moodIds: deriveMoodIds([media.description, ...(media.genres || []), ...(media.tags || []).map((t) => t.name)]),
    sourceRef: {
      provider: 'anilist', external_id: String(media.id), external_url: media.siteUrl || null,
      source_priority: media.type === 'ANIME' ? 10 : subtype === 'manhwa' ? 20 : 10,
    },
  };
}

// ─── AniList ─────────────────────────────────────────────────────────────────

const ANILIST_URL = 'https://graphql.anilist.co';
const GQL = `query($page:Int!$perPage:Int!$type:MediaType!$sort:[MediaSort!]$formatIn:[MediaFormat!]$status:MediaStatus$countryOfOrigin:CountryCode$averageScoreGreater:Int$popularityGreater:Int){Page(page:$page,perPage:$perPage){pageInfo{currentPage hasNextPage}media(type:$type,sort:$sort,isAdult:false,format_in:$formatIn,status:$status,countryOfOrigin:$countryOfOrigin,averageScore_greater:$averageScoreGreater,popularity_greater:$popularityGreater){id type format status seasonYear episodes duration chapters volumes countryOfOrigin isAdult popularity averageScore description(asHtml:false)siteUrl title{romaji english native}synonyms coverImage{extraLarge large}bannerImage genres tags{name rank}}}}`;

async function fetchAniListPage(vars, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: GQL, variables: vars }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ตอบกลับ ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data.Page;
}

// ─── Supabase upsert ─────────────────────────────────────────────────────────

async function upsertTitle(norm, skipDuplicates) {
  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', 'anilist').eq('external_id', norm.anilistId).maybeSingle();
  if (existingRef?.canonical_title_id && skipDuplicates) return 'skipped';

  let titleId = existingRef?.canonical_title_id || null;
  const wasExisting = !!titleId;

  if (!titleId) {
    const { data: bySlug } = await supabase.from('canonical_titles').select('id').eq('slug', norm.canonical.slug).maybeSingle();
    if (bySlug?.id && skipDuplicates) return 'skipped';
    titleId = bySlug?.id || null;
  }

  if (titleId) {
    const { error } = await supabase.from('canonical_titles').update(norm.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('canonical_titles').upsert(norm.canonical, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    titleId = data.id;
  }

  for (const { table, rows } of [
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: 'anilist', ...a })) },
    { table: 'title_genres', rows: norm.genres.map((g) => ({ canonical_title_id: titleId, ...g })) },
    { table: 'title_tags', rows: norm.tags.map((t) => ({ canonical_title_id: titleId, ...t })) },
    { table: 'title_moods', rows: norm.moodIds.map((mood_id) => ({ canonical_title_id: titleId, mood_id })) },
  ]) {
    const { error: delErr } = await supabase.from(table).delete().eq('canonical_title_id', titleId);
    if (delErr) throw delErr;
    if (rows.length) { const { error: insErr } = await supabase.from(table).insert(rows); if (insErr) throw insErr; }
  }

  const { error: refErr } = await supabase.from('title_source_refs').upsert(
    { canonical_title_id: titleId, ...norm.sourceRef, last_synced_at: new Date().toISOString(), fetched_at: new Date().toISOString() },
    { onConflict: 'provider,external_id' },
  );
  if (refErr && refErr.code !== 'PGRST205') throw refErr;
  return wasExisting ? 'updated' : 'imported';
}

// ─── Config options ───────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'POPULARITY_DESC', label: 'ยอดนิยม', icon: TrendingUp },
  { value: 'SCORE_DESC',      label: 'คะแนนสูง', icon: Star },
  { value: 'TRENDING_DESC',   label: 'กระแส',    icon: Flame },
  { value: 'UPDATED_AT_DESC', label: 'อัพเดทล่าสุด', icon: Clock },
  { value: 'START_DATE_DESC', label: 'ออกใหม่',   icon: CalendarDays },
  { value: 'ID_DESC',         label: 'เพิ่มใหม่ใน AniList', icon: Hash },
];

// AniList ANIME formats
const ANIME_FORMATS = [
  { value: '',        label: 'ทั้งหมด' },
  { value: 'TV',      label: 'TV Series' },
  { value: 'MOVIE',   label: 'Movie' },
  { value: 'OVA',     label: 'OVA' },
  { value: 'ONA',     label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
];

// Manga subtypes: mapped to AniList countryOfOrigin + format combos
// AniList distinguishes manga origin by countryOfOrigin, not by a "manhwa" format
const MANGA_SUBTYPES = [
  { value: '',         label: 'ทั้งหมด', country: '',   format: '' },
  { value: 'JP',       label: '🇯🇵 Manga', country: 'JP', format: '' },
  { value: 'KR',       label: '🇰🇷 Manhwa', country: 'KR', format: '' },
  { value: 'CN',       label: '🇨🇳 Manhua', country: 'CN', format: '' },
  { value: 'NOVEL',    label: '📖 Novel',    country: '',   format: 'NOVEL' },
  { value: 'ONE_SHOT', label: '📄 One Shot', country: '',   format: 'ONE_SHOT' },
];

const STATUS_OPTIONS = [
  { value: '',               label: 'ทั้งหมด' },
  { value: 'RELEASING',      label: 'กำลังออก' },
  { value: 'FINISHED',       label: 'จบแล้ว' },
  { value: 'NOT_YET_RELEASED', label: 'เร็วๆ นี้' },
  { value: 'HIATUS',         label: 'หยุดพัก' },
  { value: 'CANCELLED',      label: 'ยกเลิก' },
];

const LOG_ICON = {
  imported: <CheckCircle2 size={12} />,
  updated:  <RefreshCw size={12} />,
  skipped:  <SkipForward size={12} />,
  error:    <XCircle size={12} />,
  info:     <Info size={12} />,
  success:  <CheckCircle2 size={12} />,
};
const LOG_COLOR = {
  imported: '#16a34a', updated: '#2563eb', skipped: '#9ca3af',
  error: '#dc2626', info: 'var(--text-tertiary)', success: '#16a34a',
};

// ─── Small reusable chip button ───────────────────────────────────────────────
function Chip({ active, onClick, disabled, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.45rem 0.85rem', borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap',
        border: `1.5px solid ${active ? (color || 'var(--primary-500)') : 'var(--border-default)'}`,
        background: active ? `color-mix(in srgb, ${color || 'var(--primary-500)'} 14%, transparent)` : 'var(--bg-primary)',
        color: active ? (color || 'var(--primary-700)') : 'var(--text-secondary)',
        transition: 'all 0.15s ease', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ─── Number stepper ───────────────────────────────────────────────────────────
function Stepper({ value, onChange, min, max, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>−</button>
      <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>+</button>
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--primary-500)' : 'var(--bg-tertiary)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--paper-tint) 96%, transparent), color-mix(in srgb, var(--bg-elevated) 98%, transparent))',
      border: '1px solid color-mix(in srgb, var(--ink-900) 8%, transparent)',
      borderRadius: 24, padding: 'var(--space-6)',
    }}>
      <p style={{ margin: '0 0 var(--space-4)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  type: 'ANIME',
  sort: 'POPULARITY_DESC',
  animeFormat: '',
  mangaSubtype: '',   // '' | 'JP' | 'KR' | 'CN' | 'NOVEL' | 'ONE_SHOT'
  status: '',
  minScore: '',
  minPopularity: '',
  pages: 3,
  perPage: 25,
};

export function AdminFetch() {
  const { t } = useLanguage();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState([]);
  const abortRef = useRef(null);
  const logEndRef = useRef(null);

  const set = useCallback((key, value) => setConfig((p) => ({ ...p, [key]: value })), []);

  const addLog = useCallback((type, message) => {
    const entry = { id: `${Date.now()}-${Math.random()}`, type, message, time: new Date().toLocaleTimeString('th-TH') };
    setLogs((p) => { const n = [...p, entry]; return n.length > 200 ? n.slice(-200) : n; });
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  }, []);

  // Build AniList variables from config
  const buildVars = useCallback((page) => {
    const mangaSub = MANGA_SUBTYPES.find((s) => s.value === config.mangaSubtype) || MANGA_SUBTYPES[0];
    return {
      type: config.type,
      sort: [config.sort],
      perPage: config.perPage,
      page,
      ...(config.type === 'ANIME' && config.animeFormat ? { formatIn: [config.animeFormat] } : {}),
      ...(config.type === 'MANGA' && mangaSub.format ? { formatIn: [mangaSub.format] } : {}),
      ...(config.type === 'MANGA' && mangaSub.country ? { countryOfOrigin: mangaSub.country } : {}),
      ...(config.status ? { status: config.status } : {}),
      ...(config.minScore ? { averageScoreGreater: Number(config.minScore) } : {}),
      ...(config.minPopularity ? { popularityGreater: Number(config.minPopularity) } : {}),
    };
  }, [config]);

  const handleFetch = async () => {
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: config.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });

    const sortLabel = SORT_OPTIONS.find((s) => s.value === config.sort)?.label || config.sort;
    addLog('info', `เริ่มดึง ${config.type} — ${sortLabel}`);

    try {
      for (let page = 1; page <= config.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', `หน้า ${page}/${config.pages}…`);

        let pageData;
        try {
          pageData = await fetchAniListPage(buildVars(page), abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', `ดึงข้อมูลล้มเหลว: ${err.message}`);
          break;
        }

        const items = pageData.media || [];
        addLog('info', `ได้รับ ${items.length} รายการ`);

        for (const media of items) {
          if (abortRef.current.signal.aborted) break;
          const norm = normalizeMedia(media);
          try {
            const result = await upsertTitle(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated:  result === 'updated'  ? p.updated  + 1 : p.updated,
              skipped:  result === 'skipped'  ? p.skipped  + 1 : p.skipped,
            }));
            const label = result === 'imported' ? 'ใหม่' : result === 'updated' ? 'อัพเดท' : 'ข้าม';
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pageInfo?.hasNextPage) { addLog('info', 'ไม่มีหน้าถัดไป'); break; }
        if (page < config.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 1200));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'เสร็จสิ้น');
        toast.success('ดึงข้อมูลเสร็จสิ้น');
      } else {
        addLog('info', 'หยุดโดยผู้ใช้');
        toast('หยุดแล้ว');
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const totalEstimate = config.pages * config.perPage;
  const pageProgress = progress ? Math.min(((progress.page - 1) / progress.totalPages) * 100, 100) : 0;

  return (
    <div className="admin-page-content">

      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            <Download size={24} /> {t('admin.fetch.pageTitle')}
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {t('admin.fetch.pageSubtitle')}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-5)', alignItems: 'start' }}>

        {/* ── Left: Config ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {/* 1. Type */}
          <Section title={t('admin.fetch.typeLabel')}>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {[
                { value: 'ANIME', label: t('admin.fetch.typeAnime'), emoji: '🎌' },
                { value: 'MANGA', label: t('admin.fetch.typeManga'), emoji: '📚' },
              ].map((tp) => (
                <button
                  key={tp.value}
                  type="button"
                  disabled={running}
                  onClick={() => setConfig((p) => ({ ...p, type: tp.value, animeFormat: '', mangaSubtype: '' }))}
                  style={{
                    flex: 1, padding: 'var(--space-4)', borderRadius: 18, cursor: 'pointer',
                    border: `2px solid ${config.type === tp.value ? 'var(--primary-500)' : 'var(--border-default)'}`,
                    background: config.type === tp.value
                      ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                      : 'var(--bg-primary)',
                    textAlign: 'left', transition: 'all 0.15s',
                    opacity: running ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{tp.emoji}</div>
                  <div style={{ fontWeight: 700, color: config.type === tp.value ? 'var(--primary-700)' : 'var(--text-primary)', fontSize: '0.92rem' }}>
                    {tp.label}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {/* 2. Subtype / Format */}
          <Section title={config.type === 'ANIME' ? t('admin.fetch.formatLabel') : 'ประเภทย่อย'}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {config.type === 'ANIME'
                ? ANIME_FORMATS.map((f) => (
                    <Chip key={f.value} active={config.animeFormat === f.value} disabled={running}
                      onClick={() => set('animeFormat', f.value)}>
                      {f.label}
                    </Chip>
                  ))
                : MANGA_SUBTYPES.map((s) => (
                    <Chip key={s.value} active={config.mangaSubtype === s.value} disabled={running}
                      onClick={() => set('mangaSubtype', s.value)}>
                      {s.label}
                    </Chip>
                  ))
              }
            </div>
            {config.type === 'MANGA' && config.mangaSubtype && (
              <p style={{ margin: 'var(--space-3) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                {config.mangaSubtype === 'KR' && 'กรองโดย countryOfOrigin=KR — ครอบคลุมทั้ง Manhwa และ Webtoon'}
                {config.mangaSubtype === 'CN' && 'กรองโดย countryOfOrigin=CN — ครอบคลุม Manhua ทุกรูปแบบ'}
                {config.mangaSubtype === 'JP' && 'กรองโดย countryOfOrigin=JP — เฉพาะ Manga ญี่ปุ่น'}
                {config.mangaSubtype === 'NOVEL' && 'กรองโดย format=NOVEL — Light Novel และ Web Novel'}
                {config.mangaSubtype === 'ONE_SHOT' && 'กรองโดย format=ONE_SHOT — ตอนเดียวจบ'}
              </p>
            )}
          </Section>

          {/* 3. Sort */}
          <Section title={t('admin.fetch.sortLabel')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {SORT_OPTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <Chip key={s.value} active={config.sort === s.value} disabled={running}
                    onClick={() => set('sort', s.value)}>
                    <Icon size={13} />
                    {s.label}
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* 4. Status */}
          <Section title={t('admin.fetch.statusLabel')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {STATUS_OPTIONS.map((s) => (
                <Chip key={s.value} active={config.status === s.value} disabled={running}
                  onClick={() => set('status', s.value)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </Section>

          {/* 5. Score / Popularity filter */}
          <Section title={t('admin.fetch.extraFilters')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Star size={13} /> {t('admin.fetch.scoreMin')}
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(0–100)</span>
                </label>
                <input type="number" className="form-input" placeholder="ไม่จำกัด"
                  min={0} max={100} value={config.minScore} disabled={running}
                  onChange={(e) => set('minScore', e.target.value)} />
              </div>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={13} /> {t('admin.fetch.popularityMin')}
                </label>
                <input type="number" className="form-input" placeholder="ไม่จำกัด"
                  min={0} value={config.minPopularity} disabled={running}
                  onChange={(e) => set('minPopularity', e.target.value)} />
              </div>
            </div>
          </Section>

        </div>

        {/* ── Right: Options + Action ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'calc(var(--header-height) + 1rem)' }}>

          {/* Pages + Per page */}
          <Section title={t('admin.fetch.volumeLabel')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="form-label">{t('admin.fetch.pages')}</label>
                <Stepper value={config.pages} onChange={(v) => set('pages', v)} min={1} max={20} disabled={running} />
              </div>
              <div>
                <label className="form-label">{t('admin.fetch.perPage')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {[10, 25, 50].map((n) => (
                    <Chip key={n} active={config.perPage === n} disabled={running} onClick={() => set('perPage', n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
              <div style={{
                padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>~{totalEstimate}</span>
                <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{t('admin.fetch.willFetch')}</p>
              </div>
            </div>
          </Section>

          {/* Duplicate mode */}
          <Section title={t('admin.fetch.duplicateLabel')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', cursor: running ? 'default' : 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('admin.fetch.skipDuplicates')}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {skipDuplicates ? t('admin.fetch.skipOn') : t('admin.fetch.skipOff')}
                  </div>
                </div>
                <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} disabled={running} />
              </label>
              <div style={{
                fontSize: '0.78rem', color: 'var(--text-tertiary)',
                padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                lineHeight: 1.55,
              }}>
                {skipDuplicates
                  ? '✦ เหมาะสำหรับดึงเรื่องใหม่ๆ เข้าระบบโดยไม่แตะข้อมูลเดิม'
                  : '✦ เหมาะสำหรับ sync ข้อมูลเรื่องเก่า เช่น ตอนใหม่ คะแนน สถานะ'}
              </div>
            </div>
          </Section>

          {/* Action button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!running ? (
              <button type="button" className="primary-btn" onClick={handleFetch}
                style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}>
                <Play size={16} /> {t('admin.fetch.fetchBtn')}
              </button>
            ) : (
              <button type="button" onClick={() => abortRef.current?.abort()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: 'var(--space-4)', background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                  color: 'white', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.95rem',
                  cursor: 'pointer', boxShadow: '0 8px 20px rgba(220,38,38,0.3)',
                }}>
                <Square size={16} /> {t('admin.fetch.stopBtn')}
              </button>
            )}
            {progress && !running && (
              <button type="button" className="action-btn" onClick={() => { setProgress(null); setLogs([]); }}
                style={{ width: '100%', justifyContent: 'center' }}>
                {t('admin.fetch.clearResults')}
              </button>
            )}
          </div>

          {/* Progress stats */}
          {progress && (
            <Section title={running ? 'กำลังดึง…' : 'ผลลัพธ์'}>
              {running && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>หน้า {progress.page}/{progress.totalPages}</span>
                    <span>{progress.fetched} รายการ</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${pageProgress}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {[
                  { label: t('admin.fetch.statNew'),     value: progress.imported, color: '#16a34a' },
                  { label: t('admin.fetch.statUpdated'), value: progress.updated,  color: '#2563eb' },
                  { label: t('admin.fetch.statSkipped'), value: progress.skipped,  color: 'var(--text-tertiary)' },
                  { label: t('admin.fetch.statErrors'),  value: progress.errors,   color: '#dc2626' },
                ].map((stat) => (
                  <div key={stat.label} style={{
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 1 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      </div>

      {/* ── Log ── */}
      {logs.length > 0 && (
        <div style={{
          marginTop: 'var(--space-5)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--paper-tint) 96%, transparent), color-mix(in srgb, var(--bg-elevated) 98%, transparent))',
          border: '1px solid color-mix(in srgb, var(--ink-900) 8%, transparent)',
          borderRadius: 24, padding: 'var(--space-5)',
        }}>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logTitle')}
          </p>
          <div style={{
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)',
            fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace', fontSize: '0.76rem',
          }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', padding: '0.18rem 0.2rem', color: LOG_COLOR[log.type] }}>
                <span style={{ flexShrink: 0 }}>{LOG_ICON[log.type]}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, fontSize: '0.7rem' }}>{log.time}</span>
                <span style={{ wordBreak: 'break-word', color: LOG_COLOR[log.type] }}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logItems', { count: logs.length })}
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!progress && logs.length === 0 && (
        <div className="admin-empty-state" style={{ marginTop: 'var(--space-5)' }}>
          <Download size={26} style={{ color: 'var(--text-tertiary)', marginBottom: '0.75rem' }} />
          <span className="admin-state-title">{t('admin.fetch.readyTitle')}</span>
          <p className="admin-state-description">
            {t('admin.fetch.readyHint')}
          </p>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AdminFetch;
