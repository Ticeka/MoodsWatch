import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Download, Play, Square, RefreshCw,
  CheckCircle2, XCircle, SkipForward, Info,
  TrendingUp, Star, Flame, Clock, CalendarDays, Hash, Users, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/shared/lib/supabase';
import { getAutoDerivableMoods } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { normalizeTrailer } from '@/shared/lib/trailers';

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
  return getAutoDerivableMoods()
    .filter((mood) => (mood.tags || []).some((tag) => hay.includes(tag.toLowerCase())))
    .map((mood) => mood.id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAniListTrailerPatch(media) {
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
    trailer_url: trailer?.url || null,
    trailer_site: trailer?.site || null,
    trailer_video_id: trailer?.videoId || null,
    trailer_thumbnail_url: trailer?.thumbnailUrl || null,
    trailer_source: trailer?.source || 'anilist',
  };
}

function getMediaDisplayTitle(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || `AniList #${media?.id ?? ''}`;
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
      ...buildAniListTrailerPatch(media),
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
      raw_payload: media,
    },
  };
}

// ─── AniList ─────────────────────────────────────────────────────────────────

const ANILIST_URL = import.meta.env.DEV ? '/anilist-gql' : 'https://graphql.anilist.co';
const GQL = `query($page:Int!$perPage:Int!$type:MediaType!$sort:[MediaSort!]$formatIn:[MediaFormat!]$status:MediaStatus$countryOfOrigin:CountryCode$averageScoreGreater:Int$popularityGreater:Int){Page(page:$page,perPage:$perPage){pageInfo{currentPage hasNextPage}media(type:$type,sort:$sort,isAdult:false,format_in:$formatIn,status:$status,countryOfOrigin:$countryOfOrigin,averageScore_greater:$averageScoreGreater,popularity_greater:$popularityGreater){id type format status seasonYear episodes duration chapters volumes countryOfOrigin isAdult popularity averageScore description(asHtml:false)siteUrl title{romaji english native}synonyms coverImage{extraLarge large}bannerImage genres tags{name rank} trailer{id site thumbnail}}}}`;
const ANILIST_TRAILER_GQL = `query($id:Int!){Media(id:$id){id type siteUrl title{romaji english native} trailer{id site thumbnail}}}`;

async function fetchAniListGraphQL(query, variables, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

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

// ─── AniList characters & staff query ────────────────────────────────────────

const CHAR_STAFF_GQL = `query($id:Int!){Media(id:$id){characters(sort:[ROLE,RELEVANCE],perPage:25){edges{role node{id name{full native}image{medium}}voiceActors(language:JAPANESE){id name{full native}image{medium}}}}staff(sort:RELEVANCE,perPage:25){edges{role node{id name{full native}image{medium}}}}}}`;

async function fetchAniListCharStaff(anilistId, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: CHAR_STAFF_GQL, variables: { id: anilistId } }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data?.Media || null;
}

async function fetchAniListTrailerById(anilistId, signal) {
  const data = await fetchAniListGraphQL(ANILIST_TRAILER_GQL, { id: anilistId }, signal);
  return data?.Media || null;
}

// ─── Jikan (MyAnimeList) ──────────────────────────────────────────────────────

const JIKAN_BASE = 'https://api.jikan.moe/v4';
// Genre IDs: Erotica=49, exclude Yaoi=28, Shounen Ai=26

function mapJikanStatus(s) {
  if (!s) return 'ongoing';
  const u = s.toLowerCase();
  if (u.includes('finish')) return 'completed';
  if (u.includes('hiatus')) return 'hiatus';
  if (u.includes('discontinu') || u.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

function normalizeJikanManga(item) {
  const title = item.title_english || item.title || `jikan-${item.mal_id}`;
  const slugBase = item.title_english || item.title || `manhwa-${item.mal_id}`;
  const allGenreNames = [
    ...(item.genres || []).map((g) => g.name),
    ...(item.themes || []).map((th) => th.name),
    ...(item.demographics || []).map((d) => d.name),
  ];
  const releaseYear = item.published?.from ? new Date(item.published.from).getFullYear() : null;
  return {
    malId: String(item.mal_id),
    displayTitle: title,
    coverImage: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    canonical: {
      slug: `${slugify(slugBase) || 'manhwa'}-mal-${item.mal_id}`,
      canonical_title: title,
      type: 'manga', subtype: 'manhwa',
      origin_country: 'KR', origin_language: 'ko',
      status: mapJikanStatus(item.status),
      release_year: releaseYear,
      chapters: item.chapters || null, volumes: item.volumes || null,
      episodes: null, duration_minutes: null,
      is_adult: true,
      cover_image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
      banner_image: null,
      synopsis: item.synopsis || null,
      avg_score: item.score ? Math.round(item.score * 10) : null,
      popularity_score: item.scored_by || null,
      last_synced_at: new Date().toISOString(),
    },
    aliases: [
      item.title_english && { alias: item.title_english, language_code: 'en', alias_type: 'english', is_primary: true },
      item.title && item.title !== item.title_english && { alias: item.title, language_code: 'ja-Latn', alias_type: 'romaji', is_primary: !item.title_english },
      item.title_japanese && { alias: item.title_japanese, language_code: null, alias_type: 'native', is_primary: false },
    ].filter(Boolean),
    genres: allGenreNames.map((genre_name) => ({ genre_name })),
    tags: allGenreNames.map((tag_name) => ({ tag_name, weight: null, source_provider: 'jikan' })),
    moodIds: deriveMoodIds([item.synopsis, ...allGenreNames]),
    sourceRef: {
      provider: 'jikan', external_id: String(item.mal_id),
      external_url: item.url || null, source_priority: 20,
    },
  };
}

async function fetchJikanPage(page, jikanCfg, signal) {
  const params = new URLSearchParams({
    type: 'manhwa', genres: '49',
    genres_exclude: '28,26',
    limit: String(jikanCfg.perPage),
    page: String(page),
    order_by: jikanCfg.sort,
    sort: 'desc',
  });
  const res = await fetch(`${JIKAN_BASE}/manga?${params}`, { signal });
  if (!res.ok) throw new Error(`Jikan ตอบกลับ ${res.status}`);
  return res.json();
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

async function upsertCharStaff(titleId, media) {
  const { error: delCharErr } = await supabase.from('title_characters').delete().eq('canonical_title_id', titleId);
  if (delCharErr) throw delCharErr;
  const { error: delStaffErr } = await supabase.from('title_staff').delete().eq('canonical_title_id', titleId);
  if (delStaffErr) throw delStaffErr;

  const chars = (media?.characters?.edges || []).map((edge, i) => ({
    canonical_title_id: titleId,
    anilist_id: edge.node?.id ?? null,
    name_full: edge.node?.name?.full ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_url: edge.node?.image?.medium ?? null,
    role: edge.role ?? null,
    voice_actor_name: edge.voiceActors?.[0]?.name?.full ?? null,
    voice_actor_image: edge.voiceActors?.[0]?.image?.medium ?? null,
    sort_order: i,
  }));

  const staff = (media?.staff?.edges || []).map((edge, i) => ({
    canonical_title_id: titleId,
    anilist_id: edge.node?.id ?? null,
    name_full: edge.node?.name?.full ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_url: edge.node?.image?.medium ?? null,
    role: edge.role ?? null,
    sort_order: i,
  }));

  if (chars.length) { const { error } = await supabase.from('title_characters').insert(chars); if (error) throw error; }
  if (staff.length) { const { error } = await supabase.from('title_staff').insert(staff); if (error) throw error; }
  return { chars: chars.length, staff: staff.length };
}

async function upsertJikanTitle(norm, skipDuplicates) {
  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', 'jikan').eq('external_id', norm.malId).maybeSingle();
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
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: 'jikan', ...a })) },
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
  { value: 'POPULARITY_DESC', labelKey: 'admin.fetch.sortPopularity', icon: TrendingUp },
  { value: 'SCORE_DESC', labelKey: 'admin.fetch.sortScore', icon: Star },
  { value: 'TRENDING_DESC', labelKey: 'admin.fetch.sortTrending', icon: Flame },
  { value: 'UPDATED_AT_DESC', labelKey: 'admin.fetch.sortUpdated', icon: Clock },
  { value: 'START_DATE_DESC', labelKey: 'admin.fetch.sortStartDate', icon: CalendarDays },
  { value: 'ID_DESC', labelKey: 'admin.fetch.sortIdDesc', icon: Hash },
];

const ANIME_FORMATS = [
  { value: '', labelKey: 'admin.fetch.formatAll' },
  { value: 'TV', labelKey: 'admin.fetch.formatTv' },
  { value: 'MOVIE', labelKey: 'admin.fetch.formatMovie' },
  { value: 'OVA', labelKey: 'admin.fetch.formatOva' },
  { value: 'ONA', labelKey: 'admin.fetch.formatOna' },
  { value: 'SPECIAL', labelKey: 'admin.fetch.formatSpecial' },
];

const MANGA_SUBTYPES = [
  { value: '', labelKey: 'admin.fetch.subtypeAll', country: '', format: '' },
  { value: 'JP', labelKey: 'admin.fetch.subtypeMangaJp', country: 'JP', format: '' },
  { value: 'KR', labelKey: 'admin.fetch.subtypeManhwaKr', country: 'KR', format: '' },
  { value: 'CN', labelKey: 'admin.fetch.subtypeManhuaCn', country: 'CN', format: '' },
  { value: 'NOVEL', labelKey: 'admin.fetch.subtypeNovel', country: '', format: 'NOVEL' },
  { value: 'ONE_SHOT', labelKey: 'admin.fetch.subtypeOneShot', country: '', format: 'ONE_SHOT' },
];

const STATUS_OPTIONS = [
  { value: '', labelKey: 'admin.fetch.statusAll' },
  { value: 'RELEASING', labelKey: 'admin.fetch.statusReleasing' },
  { value: 'FINISHED', labelKey: 'admin.fetch.statusFinished' },
  { value: 'NOT_YET_RELEASED', labelKey: 'admin.fetch.statusNotYetReleased' },
  { value: 'HIATUS', labelKey: 'admin.fetch.statusHiatus' },
  { value: 'CANCELLED', labelKey: 'admin.fetch.statusCancelled' },
];

function matchesTrailerCategory(titleRecord, category) {
  if (category === 'all') return true;

  const subtype = String(titleRecord?.subtype || '').toLowerCase();
  const type = String(titleRecord?.type || '').toLowerCase();

  if (category === 'anime') {
    return subtype === 'anime' || type === 'anime';
  }

  if (category === 'manga') {
    return subtype === 'manga' || (type === 'manga' && !subtype);
  }

  return subtype === category;
}

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
function Stepper({ value, onChange, min, max, disabled, step = 1 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={disabled || value <= min}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>−</button>
      <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={disabled || value >= max}
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
  const { t, language } = useLanguage();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('titles');
  const [csConfig, setCsConfig] = useState({ onlyMissing: true, limit: 50 });
  const [jikanConfig, setJikanConfig] = useState({ sort: 'score', pages: 3, perPage: 25 });
  const [trailerConfig, setTrailerConfig] = useState({ onlyMissing: true, category: 'all', limit: 100, delayMs: 1200 });
  const abortRef = useRef(null);
  const logContainerRef = useRef(null);

  const set = useCallback((key, value) => setConfig((p) => ({ ...p, [key]: value })), []);

  const addLog = useCallback((type, message) => {
    const locale = language === 'th' ? 'th-TH' : 'en-US';
    const entry = { id: `${Date.now()}-${Math.random()}`, type, message, time: new Date().toLocaleTimeString(locale) };
    setLogs((p) => { const n = [...p, entry]; return n.length > 200 ? n.slice(-200) : n; });
  }, [language]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

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

  const trailerCategoryOptions = [
    { value: 'all', label: t('admin.titles.allSubtypes') },
    { value: 'anime', label: t('admin.titles.subtypeAnime') },
    { value: 'manga', label: t('admin.titles.subtypeManga') },
    { value: 'manhwa', label: t('admin.titles.subtypeManhwa') },
    { value: 'manhua', label: t('admin.titles.subtypeManhua') },
    { value: 'webtoon', label: t('admin.titles.subtypeWebtoon') },
  ];

  const handleFetch = async () => {
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: config.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });

    const sortLabel = t(SORT_OPTIONS.find((s) => s.value === config.sort)?.labelKey || 'admin.fetch.sortPopularity');
    addLog('info', t('admin.fetch.logStart', { type: config.type, sort: sortLabel }));

    try {
      for (let page = 1; page <= config.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', t('admin.fetch.logPage', { page, total: config.pages }));

        let pageData;
        try {
          pageData = await fetchAniListPage(buildVars(page), abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', t('admin.fetch.logFetchFailed', { message: err.message }));
          break;
        }

        const items = pageData.media || [];
        addLog('info', t('admin.fetch.logItemsReceived', { count: items.length }));

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
            const label = result === 'imported'
              ? t('admin.fetch.resultImported')
              : result === 'updated'
                ? t('admin.fetch.resultUpdated')
                : t('admin.fetch.resultSkipped');
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pageInfo?.hasNextPage) { addLog('info', t('admin.fetch.logNoNextPage')); break; }
        if (page < config.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 1200));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.logFinished'));
        toast.success(t('admin.fetch.fetchFinished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleCharStaff = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog('info', t('admin.fetch.cs.logStart'));

      const { data: refs, error: refsError } = await supabase
        .from('title_source_refs')
        .select('canonical_title_id, external_id')
        .eq('provider', 'anilist');
      if (refsError) throw refsError;

      let targets = refs || [];

      if (csConfig.onlyMissing) {
        const { data: existing } = await supabase.from('title_characters').select('canonical_title_id');
        const existingSet = new Set((existing || []).map((r) => r.canonical_title_id));
        targets = targets.filter((r) => !existingSet.has(r.canonical_title_id));
      }

      if (csConfig.limit > 0) targets = targets.slice(0, csConfig.limit);

      addLog('info', t('admin.fetch.cs.logTotal', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, chars: 0, staff: 0, errors: 0 });

      for (const ref of targets) {
        if (abortRef.current.signal.aborted) break;
        try {
          const media = await fetchAniListCharStaff(Number(ref.external_id), abortRef.current.signal);
          const result = await upsertCharStaff(ref.canonical_title_id, media);
          setProgress((p) => ({ ...p, done: p.done + 1, chars: p.chars + result.chars, staff: p.staff + result.staff }));
          addLog('imported', `[${ref.canonical_title_id}] chars:${result.chars} staff:${result.staff}`);
        } catch (err) {
          if (err.name === 'AbortError') break;
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `[${ref.canonical_title_id}] ${err.message}`);
        }
        if (!abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 750));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.cs.logFinished'));
        toast.success(t('admin.fetch.cs.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleTrailerBackfill = async () => {
    if (!supabase) {
      toast.error(t('admin.fetch.trailers.supabaseUnavailable'));
      return;
    }

    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog(
        'info',
        t('admin.fetch.trailers.logStart', {
          mode: trailerConfig.onlyMissing
            ? t('admin.fetch.trailers.modeMissing')
            : t('admin.fetch.trailers.modeRefresh'),
          delayMs: trailerConfig.delayMs,
        })
      );

      let query = supabase
        .from('title_source_refs')
        .select('canonical_title_id, external_id, canonical_titles!inner(id, canonical_title, slug, type, subtype, trailer_url, trailer_video_id)')
        .eq('provider', 'anilist')
        .order('canonical_title_id', { ascending: true });

      if (trailerConfig.onlyMissing) {
        query = query.is('canonical_titles.trailer_url', null).is('canonical_titles.trailer_video_id', null);
      }

      const { data: refRows, error: refError } = await query;
      if (refError) throw refError;

      let targets = (refRows || []).filter((target) => {
        const titleRecord = Array.isArray(target.canonical_titles)
          ? target.canonical_titles[0]
          : target.canonical_titles;

        return matchesTrailerCategory(titleRecord, trailerConfig.category);
      });
      if (trailerConfig.limit > 0) {
        targets = targets.slice(0, trailerConfig.limit);
      }

      addLog('info', t('admin.fetch.trailers.logTargets', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, updated: 0, noTrailer: 0, errors: 0 });

      if (targets.length === 0) {
        addLog('success', t('admin.fetch.trailers.logNothingToDo'));
        toast.success(t('admin.fetch.trailers.nothingToDo'));
        return;
      }

      for (const target of targets) {
        if (abortRef.current.signal.aborted) break;

        const titleRecord = Array.isArray(target.canonical_titles)
          ? target.canonical_titles[0]
          : target.canonical_titles;
        const fallbackTitle = titleRecord?.canonical_title || `#${target.canonical_title_id}`;

        try {
          const media = await fetchAniListTrailerById(Number(target.external_id), abortRef.current.signal);

          const { error: sourceRefError } = await supabase.from('title_source_refs').upsert(
            {
              canonical_title_id: target.canonical_title_id,
              provider: 'anilist',
              external_id: String(target.external_id),
              external_url: media?.siteUrl || null,
              source_priority: titleRecord?.type === 'anime' ? 10 : 20,
              raw_payload: media,
              last_synced_at: new Date().toISOString(),
              fetched_at: new Date().toISOString(),
            },
            { onConflict: 'provider,external_id' },
          );
          if (sourceRefError && sourceRefError.code !== 'PGRST205') throw sourceRefError;

          if (!media?.trailer?.id) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noTrailer: current.noTrailer + 1,
            }));
            addLog('skipped', t('admin.fetch.trailers.logNoTrailer', { title: getMediaDisplayTitle(media) || fallbackTitle }));
          } else {
            const patch = buildAniListTrailerPatch(media);
            const { error: updateError } = await supabase
              .from('canonical_titles')
              .update({
                ...patch,
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', target.canonical_title_id);
            if (updateError) throw updateError;

            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              updated: current.updated + 1,
            }));
            addLog(
              'updated',
              t('admin.fetch.trailers.logUpdated', {
                title: getMediaDisplayTitle(media) || fallbackTitle,
                site: patch.trailer_site || 'external',
              })
            );
          }
        } catch (error) {
          if (error.name === 'AbortError') break;
          setProgress((current) => ({
            ...current,
            done: current.done + 1,
            errors: current.errors + 1,
          }));
          addLog('error', `[${fallbackTitle}] ${error.message}`);
        }

        if (!abortRef.current.signal.aborted && trailerConfig.delayMs > 0) {
          await sleep(trailerConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.trailers.logFinished'));
        toast.success(t('admin.fetch.trailers.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        addLog('error', error.message);
        toast.error(error.message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleJikanFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: jikanConfig.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });
    addLog('info', `เริ่ม fetch Manhwa Adult จาก Jikan — ${jikanConfig.pages} หน้า, ${jikanConfig.perPage}/หน้า (ไม่มี BL)`);

    try {
      for (let page = 1; page <= jikanConfig.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', `หน้า ${page}/${jikanConfig.pages}`);

        let pageData;
        try {
          pageData = await fetchJikanPage(page, jikanConfig, abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', `Fetch ล้มเหลว: ${err.message}`);
          break;
        }

        const items = pageData.data || [];
        addLog('info', `ได้รับ ${items.length} รายการ`);

        for (const item of items) {
          if (abortRef.current.signal.aborted) break;
          const norm = normalizeJikanManga(item);
          try {
            const result = await upsertJikanTitle(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated:  result === 'updated'  ? p.updated  + 1 : p.updated,
              skipped:  result === 'skipped'  ? p.skipped  + 1 : p.skipped,
            }));
            const label = result === 'imported' ? 'นำเข้า' : result === 'updated' ? 'อัปเดต' : 'ข้าม';
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pagination?.has_next_page) { addLog('info', 'ไม่มีหน้าถัดไป'); break; }
        // Jikan rate limit ~3 req/s — wait 400ms between pages
        if (page < jikanConfig.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 400));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'Fetch เสร็จสมบูรณ์');
        toast.success('Jikan fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
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
            {activeTab === 'titles'
              ? t('admin.fetch.pageSubtitle')
              : activeTab === 'trailers'
                ? t('admin.fetch.trailers.tabSubtitle')
                : activeTab === 'jikan'
                  ? 'ดึง Manhwa Adult จาก MyAnimeList (ไม่มี BL)'
                  : t('admin.fetch.cs.tabSubtitle')}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
        {[
          { id: 'titles', label: t('admin.fetch.tabTitles'), Icon: Download },
          { id: 'trailers', label: t('admin.fetch.trailers.tabTitle'), Icon: RefreshCw },
          { id: 'jikan', label: 'Jikan (MAL)', Icon: Globe },
          { id: 'charstaff', label: t('admin.fetch.cs.tabTitle'), Icon: Users },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={running}
            onClick={() => { setActiveTab(id); setProgress(null); setLogs([]); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 1rem', borderRadius: 999, border: 'none',
              background: activeTab === id ? 'var(--primary-500)' : 'transparent',
              color: activeTab === id ? 'white' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.88rem',
              cursor: running ? 'default' : 'pointer', opacity: running ? 0.6 : 1,
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-5)', alignItems: 'start' }}>

        {/* ── Left: Config ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {activeTab === 'titles' ? (
            <>
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
              <Section title={config.type === 'ANIME' ? t('admin.fetch.formatLabel') : t('admin.fetch.subtypeLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {config.type === 'ANIME'
                    ? ANIME_FORMATS.map((f) => (
                        <Chip key={f.value} active={config.animeFormat === f.value} disabled={running}
                          onClick={() => set('animeFormat', f.value)}>
                          {t(f.labelKey)}
                        </Chip>
                      ))
                    : MANGA_SUBTYPES.map((s) => (
                        <Chip key={s.value} active={config.mangaSubtype === s.value} disabled={running}
                          onClick={() => set('mangaSubtype', s.value)}>
                          {t(s.labelKey)}
                        </Chip>
                      ))
                  }
                </div>
                {config.type === 'MANGA' && config.mangaSubtype && (
                  <p style={{ margin: 'var(--space-3) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {config.mangaSubtype === 'KR' && t('admin.fetch.subtypeHintKr')}
                    {config.mangaSubtype === 'CN' && t('admin.fetch.subtypeHintCn')}
                    {config.mangaSubtype === 'JP' && t('admin.fetch.subtypeHintJp')}
                    {config.mangaSubtype === 'NOVEL' && t('admin.fetch.subtypeHintNovel')}
                    {config.mangaSubtype === 'ONE_SHOT' && t('admin.fetch.subtypeHintOneShot')}
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
                        {t(s.labelKey)}
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
                      {t(s.labelKey)}
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
                    <input type="number" className="form-input" placeholder={t('admin.fetch.noLimitPlaceholder')}
                      min={0} max={100} value={config.minScore} disabled={running}
                      onChange={(e) => set('minScore', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrendingUp size={13} /> {t('admin.fetch.popularityMin')}
                    </label>
                    <input type="number" className="form-input" placeholder={t('admin.fetch.noLimitPlaceholder')}
                      min={0} value={config.minPopularity} disabled={running}
                      onChange={(e) => set('minPopularity', e.target.value)} />
                  </div>
                </div>
              </Section>
            </>
          ) : activeTab === 'trailers' ? (
            <>
              <Section title={t('admin.fetch.trailers.modeLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    {
                      key: true,
                      label: t('admin.fetch.trailers.modeMissing'),
                      hint: t('admin.fetch.trailers.modeMissingHint'),
                    },
                    {
                      key: false,
                      label: t('admin.fetch.trailers.modeRefresh'),
                      hint: t('admin.fetch.trailers.modeRefreshHint'),
                    },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setTrailerConfig((current) => ({ ...current, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${trailerConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: trailerConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: trailerConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.categoryLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {trailerCategoryOptions.map((option) => (
                      <Chip
                        key={option.value}
                        active={trailerConfig.category === option.value}
                        disabled={running}
                        onClick={() => setTrailerConfig((current) => ({ ...current, category: option.value }))}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.categoryHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={trailerConfig.limit}
                    onChange={(value) => setTrailerConfig((current) => ({ ...current, limit: value }))}
                    min={0}
                    max={1000}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.limitHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.delayLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={trailerConfig.delayMs}
                    onChange={(value) => setTrailerConfig((current) => ({ ...current, delayMs: value }))}
                    min={250}
                    max={5000}
                    step={250}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.delayHint')}
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'jikan' ? (
            <>
              {/* Jikan — Source info */}
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Globe size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Jikan API v4 (MyAnimeList)</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Manhwa · Erotica (genre 49) · ไม่มี BL/Yaoi (genre 28, 26) · เรียงตาม Score
                    </div>
                  </div>
                </div>
              </Section>

              {/* Jikan — Sort */}
              <Section title="เรียงลำดับ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'score',      label: 'Score',      Icon: Star },
                    { value: 'scored_by',  label: 'Most Rated', Icon: Users },
                    { value: 'popularity', label: 'Popularity', Icon: TrendingUp },
                    { value: 'start_date', label: 'Start Date', Icon: CalendarDays },
                  ].map(({ value, label, Icon }) => (
                    <Chip key={value} active={jikanConfig.sort === value} disabled={running}
                      onClick={() => setJikanConfig((p) => ({ ...p, sort: value }))}>
                      <Icon size={13} /> {label}
                    </Chip>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <>
              {/* Characters & Staff — Mode */}
              <Section title={t('admin.fetch.cs.modeLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    { key: true,  label: t('admin.fetch.cs.onlyMissing'), hint: t('admin.fetch.cs.onlyMissingHint') },
                    { key: false, label: t('admin.fetch.cs.refetchAll'),  hint: t('admin.fetch.cs.refetchAllHint') },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setCsConfig((p) => ({ ...p, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${csConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: csConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: csConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              {/* Characters & Staff — Limit */}
              <Section title={t('admin.fetch.cs.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={csConfig.limit}
                    onChange={(v) => setCsConfig((p) => ({ ...p, limit: v }))}
                    min={0} max={500} disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.cs.limitHint')}
                  </p>
                </div>
              </Section>
            </>
          )}

        </div>

        {/* ── Right: Options + Action ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'calc(var(--header-height) + 1rem)' }}>

          {/* Pages + Per page (titles + jikan tabs) */}
          {(activeTab === 'titles' || activeTab === 'jikan') && (
            <Section title={t('admin.fetch.volumeLabel')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label className="form-label">{t('admin.fetch.pages')}</label>
                  {activeTab === 'titles'
                    ? <Stepper value={config.pages} onChange={(v) => set('pages', v)} min={1} max={20} disabled={running} />
                    : <Stepper value={jikanConfig.pages} onChange={(v) => setJikanConfig((p) => ({ ...p, pages: v }))} min={1} max={20} disabled={running} />
                  }
                </div>
                <div>
                  <label className="form-label">{t('admin.fetch.perPage')}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {(activeTab === 'jikan' ? [10, 25] : [10, 25, 50]).map((n) => (
                      <Chip
                        key={n}
                        active={activeTab === 'titles' ? config.perPage === n : jikanConfig.perPage === n}
                        disabled={running}
                        onClick={() => activeTab === 'titles' ? set('perPage', n) : setJikanConfig((p) => ({ ...p, perPage: n }))}
                      >
                        {n}
                      </Chip>
                    ))}
                  </div>
                  {activeTab === 'jikan' && (
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                      Jikan จำกัด 25 items/หน้า
                    </p>
                  )}
                </div>
                <div style={{
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  textAlign: 'center',
                }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ~{activeTab === 'titles' ? totalEstimate : jikanConfig.pages * jikanConfig.perPage}
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{t('admin.fetch.willFetch')}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Duplicate mode (titles + jikan tabs) */}
          {(activeTab === 'titles' || activeTab === 'jikan') && (
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
                  {skipDuplicates ? t('admin.fetch.skipHintOn') : t('admin.fetch.skipHintOff')}
                </div>
              </div>
            </Section>
          )}

          {/* Action button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!running ? (
              <button type="button" className="primary-btn"
                onClick={
                  activeTab === 'titles'
                    ? handleFetch
                    : activeTab === 'trailers'
                      ? handleTrailerBackfill
                      : activeTab === 'jikan'
                        ? handleJikanFetch
                        : handleCharStaff
                }
                style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}>
                <Play size={16} /> {
                  activeTab === 'titles'
                    ? t('admin.fetch.fetchBtn')
                    : activeTab === 'trailers'
                      ? t('admin.fetch.trailers.startBtn')
                      : activeTab === 'jikan'
                        ? 'Fetch Manhwa Adult'
                        : t('admin.fetch.cs.startBtn')
                }
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
            <Section title={running ? t('admin.fetch.runningTitle') : t('admin.fetch.resultTitle')}>
              {(activeTab === 'titles' || activeTab === 'jikan') && running && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.pageProgress', { page: progress.page, total: progress.totalPages })}</span>
                    <span>{t('admin.fetch.itemsProgress', { count: progress.fetched })}</span>
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
              {activeTab === 'charstaff' && running && progress.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {activeTab === 'trailers' && running && progress.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.trailers.progress', { done: progress.done, total: progress.total })}</span>
                    <span>{t('admin.fetch.trailers.delayProgress', { delayMs: trailerConfig.delayMs })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {(activeTab === 'titles' || activeTab === 'jikan'
                  ? [
                      { label: t('admin.fetch.statNew'),     value: progress.imported, color: '#16a34a' },
                      { label: t('admin.fetch.statUpdated'), value: progress.updated,  color: '#2563eb' },
                      { label: t('admin.fetch.statSkipped'), value: progress.skipped,  color: 'var(--text-tertiary)' },
                      { label: t('admin.fetch.statErrors'),  value: progress.errors,   color: '#dc2626' },
                    ]
                  : activeTab === 'trailers'
                    ? [
                        { label: t('admin.fetch.trailers.statDone'), value: progress.done, color: '#2563eb' },
                        { label: t('admin.fetch.trailers.statUpdated'), value: progress.updated, color: '#16a34a' },
                        { label: t('admin.fetch.trailers.statNoTrailer'), value: progress.noTrailer, color: 'var(--text-tertiary)' },
                        { label: t('admin.fetch.trailers.statErrors'), value: progress.errors, color: '#dc2626' },
                      ]
                  : [
                      { label: t('admin.fetch.cs.statDone'),   value: progress.done,   color: '#2563eb' },
                      { label: t('admin.fetch.cs.statChars'),  value: progress.chars,  color: '#16a34a' },
                      { label: t('admin.fetch.cs.statStaff'),  value: progress.staff,  color: '#7c3aed' },
                      { label: t('admin.fetch.cs.statErrors'), value: progress.errors, color: '#dc2626' },
                    ]
                ).map((stat) => (
                  <div key={stat.label} style={{
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: stat.color }}>{stat.value ?? 0}</div>
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
          overflowAnchor: 'none',
        }}>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logTitle')}
          </p>
          <div ref={logContainerRef} style={{
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)',
            fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace', fontSize: '0.76rem',
            overflowAnchor: 'none',
          }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', padding: '0.18rem 0.2rem', color: LOG_COLOR[log.type] }}>
                <span style={{ flexShrink: 0 }}>{LOG_ICON[log.type]}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, fontSize: '0.7rem' }}>{log.time}</span>
                <span style={{ wordBreak: 'break-word', color: LOG_COLOR[log.type] }}>{log.message}</span>
              </div>
            ))}
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
