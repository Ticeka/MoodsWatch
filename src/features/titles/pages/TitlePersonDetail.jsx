import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Loader2, Mic2, Sparkles, UserRound } from 'lucide-react';
import { getTitleBySlug } from '@/features/discover/lib/recommend';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { matchesAgeGateMode } from '@/shared/lib/ageGate';
import { matchesTitlePersonRouteId } from '@/features/titles/lib/titlePeople';
import { fetchStaffRelatedTitles, fetchVoiceActorRelatedCharacters } from '@/features/titles/api/titleDetailApi';
import '../styles/TitleDetail.css';

function PersonDetailPage({ personType = 'character' }) {
  const RELATED_ITEMS_PER_PAGE = 6;
  const { slug, personId } = useParams();
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { showAdult } = useAgeGate();
  const [title, setTitle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgeGateBlocked, setIsAgeGateBlocked] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [isRelatedLoading, setIsRelatedLoading] = useState(false);
  const [relatedPage, setRelatedPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsAgeGateBlocked(false);

      try {
        const nextTitle = await getTitleBySlug(slug);
        if (cancelled) {
          return;
        }

        if (nextTitle && !matchesAgeGateMode(nextTitle, showAdult)) {
          setTitle(null);
          setIsAgeGateBlocked(true);
          return;
        }

        setTitle(nextTitle);
      } catch (error) {
        console.error('Failed to load title person detail:', error);
        if (!cancelled) {
          setTitle(null);
          setIsAgeGateBlocked(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [showAdult, slug]);

  const person = useMemo(() => {
    const list = personType === 'staff' ? (title?.staff || []) : (title?.characters || []);
    return list.find((entry, index) => matchesTitlePersonRouteId(entry, personId, index)) || null;
  }, [personId, personType, title?.characters, title?.staff]);

  useEffect(() => {
    if (!title?.id || !person) {
      setRelatedItems([]);
      return;
    }

    let cancelled = false;

    async function loadRelated() {
      setIsRelatedLoading(true);
      try {
        const nextItems = personType === 'staff'
          ? await fetchStaffRelatedTitles({
            anilistId: person?.anilist_id || null,
            nameFull: person?.name_full || '',
            currentTitleId: title.id,
            showAdult,
          })
          : await fetchVoiceActorRelatedCharacters({
            voiceActorName: person?.voice_actor_name || '',
            currentTitleId: title.id,
            currentCharacterId: person?.anilist_id || null,
            currentCharacterName: person?.name_full || '',
            showAdult,
          });

        if (!cancelled) {
          setRelatedItems(nextItems);
        }
      } catch (error) {
        console.error('Failed to load related title person credits:', error);
        if (!cancelled) {
          setRelatedItems([]);
        }
      } finally {
        if (!cancelled) {
          setIsRelatedLoading(false);
        }
      }
    }

    loadRelated();
    return () => { cancelled = true; };
  }, [person, personType, showAdult, title?.id]);

  useEffect(() => {
    setRelatedPage(0);
  }, [personId, personType, relatedItems.length]);

  const primaryTitle = title?.title_th || title?.title_en || title?.title_native || '';
  const pageLabel = personType === 'staff'
    ? pick('รายละเอียดทีมงาน', 'Staff detail')
    : pick('รายละเอียดตัวละคร', 'Character detail');
  const personRoleLabel = personType === 'staff'
    ? (person?.role || pick('ทีมงาน', 'Staff'))
    : (person?.role === 'MAIN' ? pick('ตัวละครหลัก', 'Main character') : person?.role === 'SUPPORTING' ? pick('ตัวละครสมทบ', 'Supporting character') : pick('ตัวละคร', 'Character'));
  const leadTypeLabel = person?.lead_type === 'protagonist'
    ? pick('ตัวเอกหลัก', 'Primary protagonist')
    : person?.lead_type === 'heroine'
      ? pick('นางเอกหลัก', 'Primary heroine')
      : person?.lead_type === 'deuteragonist'
        ? pick('ตัวละครเด่นร่วม', 'Deuteragonist')
        : person?.lead_type === 'ensemble'
          ? pick('ตัวละครแกนหลัก', 'Ensemble lead')
          : '';
  const genderLabel = person?.presentation_gender === 'male'
    ? pick('พรีเซนต์เป็นชาย', 'Presents male')
    : person?.presentation_gender === 'female'
      ? pick('พรีเซนต์เป็นหญิง', 'Presents female')
      : person?.presentation_gender === 'nonbinary'
        ? pick('พรีเซนต์เป็นนอนไบนารี', 'Presents nonbinary')
        : '';
  const totalRelatedPages = Math.max(1, Math.ceil(relatedItems.length / RELATED_ITEMS_PER_PAGE));
  const pagedRelatedItems = relatedItems.slice(
    relatedPage * RELATED_ITEMS_PER_PAGE,
    (relatedPage + 1) * RELATED_ITEMS_PER_PAGE
  );

  if (isLoading) {
    return (
      <div className="detail-loading" aria-live="polite" aria-busy="true">
        <div className="detail-loading-card">
          <div className="detail-loading-spinner" aria-hidden="true">
            <Loader2 size={28} />
          </div>
          <div className="detail-loading-copy">
            <span className="detail-loading-kicker">{pick('กำลังโหลด', 'Loading')}</span>
            <h3>{pageLabel}</h3>
          </div>
        </div>
      </div>
    );
  }

  if (!title || !person) {
    return (
      <div className="detail-not-found">
        <span className="not-found-icon">
          {pick(isAgeGateBlocked ? 'เนื้อหาถูกซ่อนตามโหมดอายุ' : 'ไม่พบข้อมูลบุคคลนี้', isAgeGateBlocked ? 'Blocked by age gate' : 'Person not found')}
        </span>
        <h2>{pick(isAgeGateBlocked ? 'รายการนี้ถูกซ่อนอยู่' : 'ไม่พบหน้ารายละเอียด', isAgeGateBlocked ? 'This title is hidden' : 'Detail page not found')}</h2>
        <p>{pick('ลองย้อนกลับไปที่หน้ารายละเอียดเรื่องเดิมอีกครั้ง', 'Try going back to the title detail page.')}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate(`/title/${slug}`)}>
          {pick('กลับไปหน้ารายละเอียดเรื่อง', 'Back to title detail')}
        </button>
      </div>
    );
  }

  return (
    <div className="title-detail animate-fade-in">
      <div className="banner-bg" style={{ backgroundImage: `url(${person.image_url || title.banner || title.cover})` }}>
        <div className="banner-overlay" />
      </div>

      <div className="container relative z-10 detail-content">
        <section className="person-detail-shell">
          <div className="person-detail-back-row">
            <Link to={`/title/${slug}`} className="person-detail-back-link">
              <ArrowLeft size={16} />
              {pick('กลับไปหน้ารายละเอียดเรื่อง', 'Back to title detail')}
            </Link>
          </div>

          <div className="person-detail-card">
            <div className="person-detail-media">
              {person.image_url ? (
                <img
                  src={person.image_url}
                  alt={person.name_full || person.name_native || pageLabel}
                  className="person-detail-image"
                  loading="lazy"
                />
              ) : (
                <div className="person-detail-image person-detail-image--placeholder" aria-hidden="true">
                  <UserRound size={40} />
                </div>
              )}
            </div>

            <div className="person-detail-copy">
              <div className="person-detail-kicker">
                <span className="badge type-badge detail-badge">{pageLabel}</span>
                <span className="badge detail-badge">{primaryTitle}</span>
              </div>

              <h1 className="person-detail-title">{person.name_full || person.name_native}</h1>
              {person.name_native && person.name_native !== person.name_full ? (
                <p className="person-detail-subtitle">{person.name_native}</p>
              ) : null}

              <div className="person-detail-badges">
                {personRoleLabel ? <span className="badge detail-badge">{personRoleLabel}</span> : null}
                {leadTypeLabel ? <span className="badge detail-badge">{leadTypeLabel}</span> : null}
                {genderLabel ? <span className="badge detail-badge">{genderLabel}</span> : null}
              </div>

              <div className="person-detail-sections">
                <section className="person-detail-panel">
                  <h2 className="detail-section-heading">{pick('บริบทในเรื่องนี้', 'Context in this title')}</h2>
                  <div className="person-detail-facts">
                    <div className="person-detail-fact">
                      <span>{pick('เรื่อง', 'Title')}</span>
                      <strong>{primaryTitle}</strong>
                    </div>
                    <div className="person-detail-fact">
                      <span>{pick('บทบาท', 'Role')}</span>
                      <strong>{personRoleLabel}</strong>
                    </div>
                    {personType === 'character' && person.voice_actor_name ? (
                      <div className="person-detail-fact">
                        <span>{pick('นักพากย์', 'Voice actor')}</span>
                        <strong>{person.voice_actor_name}</strong>
                      </div>
                    ) : null}
                  </div>
                </section>

                {personType === 'character' && person.voice_actor_name ? (
                  <section className="person-detail-panel">
                    <h2 className="detail-section-heading">{pick('นักพากย์', 'Voice actor')}</h2>
                    <div className="person-detail-voice-card">
                      {person.voice_actor_image ? (
                        <img
                          src={person.voice_actor_image}
                          alt={person.voice_actor_name}
                          className="person-detail-voice-avatar"
                          loading="lazy"
                        />
                      ) : (
                        <div className="person-detail-voice-avatar person-detail-voice-avatar--placeholder" aria-hidden="true">
                          <Mic2 size={18} />
                        </div>
                      )}
                      <div>
                        <strong>{person.voice_actor_name}</strong>
                        <p>{pick('ข้อมูลนักพากย์ที่ผูกมากับเรื่องนี้', 'Voice actor data linked from this title entry.')}</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="person-detail-panel">
                  <h2 className="detail-section-heading">
                    {personType === 'staff'
                      ? pick('ทีมงานคนนี้ทำงานให้เรื่องไหนอีกบ้าง', 'Other titles this staff member worked on')
                      : pick('นักพากย์คนนี้พากย์ตัวละครไหนอีกบ้าง', 'Other characters this voice actor performed')}
                  </h2>
                  {isRelatedLoading ? (
                    <div className="person-detail-related-empty">
                      <Loader2 size={16} className="person-detail-spinner" />
                      <span>{pick('กำลังโหลดข้อมูลเพิ่มเติม', 'Loading more credits')}</span>
                    </div>
                  ) : relatedItems.length === 0 ? (
                    <div className="person-detail-related-empty">
                      <span>
                        {personType === 'staff'
                          ? pick('ตอนนี้ยังไม่พบเครดิตเรื่องอื่นจากข้อมูลที่มี', 'No other staff credits were found in the current dataset.')
                          : pick('ตอนนี้ยังไม่พบตัวละครอื่นจากนักพากย์คนนี้ในข้อมูลที่มี', 'No other voice roles were found in the current dataset.')}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="person-detail-related-list">
                      {personType === 'staff'
                        ? pagedRelatedItems.map((entry) => (
                          <Link
                            key={`staff-credit-${entry.title.id}`}
                            to={`/title/${entry.title.slug}`}
                            className="person-detail-related-card"
                          >
                            <img
                              src={entry.title.cover}
                              alt={entry.title.title_th || entry.title.title_en}
                              className="person-detail-related-image"
                              loading="lazy"
                            />
                            <div className="person-detail-related-copy">
                              <strong>{entry.title.title_th || entry.title.title_en}</strong>
                              <span>{(entry.roles || []).join(' • ') || pick('ทีมงาน', 'Staff')}</span>
                            </div>
                          </Link>
                        ))
                        : pagedRelatedItems.map((entry) => (
                          <Link
                            key={`voice-credit-${entry.title.id}-${entry.id}`}
                            to={`/title/${entry.title.slug}`}
                            className="person-detail-related-card"
                          >
                            <img
                              src={entry.image_url || entry.title.cover}
                              alt={entry.name_full}
                              className="person-detail-related-image"
                              loading="lazy"
                            />
                            <div className="person-detail-related-copy">
                              <strong>{entry.name_full}</strong>
                              <span>{entry.title.title_th || entry.title.title_en}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                      {totalRelatedPages > 1 ? (
                        <div className="person-detail-pager">
                          <button
                            type="button"
                            className="song-pager-btn"
                            onClick={() => setRelatedPage((current) => current - 1)}
                            disabled={relatedPage === 0}
                            aria-label={pick('หน้าก่อนหน้า', 'Previous page')}
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="song-pager-label">
                            {relatedPage + 1} / {totalRelatedPages}
                          </span>
                          <button
                            type="button"
                            className="song-pager-btn"
                            onClick={() => setRelatedPage((current) => current + 1)}
                            disabled={relatedPage >= totalRelatedPages - 1}
                            aria-label={pick('หน้าถัดไป', 'Next page')}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>

                <section className="person-detail-panel">
                  <h2 className="detail-section-heading">{pick('ไปต่อ', 'Explore')}</h2>
                  <div className="person-detail-actions">
                    <Link to={`/title/${slug}`} className="btn btn-secondary btn-md">
                      {pick('ดูหน้ารายละเอียดเรื่อง', 'Open title detail')}
                    </Link>
                    <Link to={`/tierlist`} className="btn btn-ghost btn-md">
                      <Sparkles size={16} />
                      {pick('เปิดหน้า tierlist', 'Browse tierlists')}
                    </Link>
                    {title.slug ? (
                      <a href={`/title/${title.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-md">
                        <ExternalLink size={16} />
                        {pick('เปิดเรื่องในแท็บใหม่', 'Open title in new tab')}
                      </a>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function TitleCharacterDetail() {
  return <PersonDetailPage personType="character" />;
}

export function TitleStaffDetail() {
  return <PersonDetailPage personType="staff" />;
}

export default TitleCharacterDetail;
