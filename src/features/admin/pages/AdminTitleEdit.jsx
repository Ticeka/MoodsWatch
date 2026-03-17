import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  buildAliasRows,
  buildCanonicalPayload,
  CANONICAL_TITLE_SELECT,
  mapCanonicalRecordToAdminForm,
} from '@/shared/lib/catalog';
import { supabase } from '@/shared/lib/supabase';
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

async function runQuery(request, fallbackMessage) {
  const result = await request;
  if (result?.error) {
    throw result.error;
  }
  return result;
}

export function AdminTitleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const { t } = useLanguage();

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

  const fetchTitleDetails = useCallback(async () => {
    if (!supabase) {
      toast.error('Unable to connect to Supabase');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data: moodsData, error: moodsError } = await supabase.from('moods').select('*').order('name_en');
      if (moodsError) throw moodsError;
      setAvailableMoods(moodsData || []);

      if (isNew) return;

      const { data, error } = await supabase
        .from('canonical_titles')
        .select(CANONICAL_TITLE_SELECT)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return;

      setFormData(mapCanonicalRecordToAdminForm(data));
      setSelectedMoods(data.moods?.map((item) => item.mood_id) || []);
      setGenreInput(data.genres?.map((item) => item.genre_name).join(', ') || '');
      setTagInput(data.tags?.map((item) => item.tag_name).join(', ') || '');
      setPlatformLinks(
        data.availability?.map((item) => ({
          platform_name: item.platform_name,
          url: item.url,
          region_code: item.region_code || '',
        })) || [],
      );
    } catch (error) {
      console.error('Error fetching title details:', error);
      toast.error(t('admin.titleEdit.unableToLoad'));
      navigate('/admin/titles');
    } finally {
      setIsLoading(false);
    }
  }, [id, isNew, navigate, t]);

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

  const handleSave = async (event) => {
    event?.preventDefault();

    if (!supabase) {
      toast.error('Unable to connect to Supabase');
      return;
    }

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
        const { data: inserted, error } = await supabase.from('canonical_titles').insert([payload]).select().single();
        if (error) throw error;
        titleId = inserted.id;
      } else {
        const { error } = await supabase.from('canonical_titles').update(payload).eq('id', id);
        if (error) throw error;
      }

      await Promise.all([
        runQuery(supabase.from('title_aliases').delete().eq('canonical_title_id', titleId)),
        runQuery(supabase.from('title_moods').delete().eq('canonical_title_id', titleId)),
        runQuery(supabase.from('title_genres').delete().eq('canonical_title_id', titleId)),
        runQuery(supabase.from('title_tags').delete().eq('canonical_title_id', titleId)),
        runQuery(supabase.from('title_availability').delete().eq('canonical_title_id', titleId)),
      ]);

      const relationPromises = [];
      const genres = genreInput.split(',').map((item) => item.trim()).filter(Boolean);
      const tags = tagInput.split(',').map((item) => item.trim()).filter(Boolean);
      const aliases = buildAliasRows(titleId, formData);
      const platforms = platformLinks
        .map((item) => ({
          platform_name: String(item.platform_name || '').trim(),
          url: String(item.url || '').trim(),
          region_code: String(item.region_code || '').trim().toUpperCase(),
        }))
        .filter((item) => item.platform_name && item.url);

      if (aliases.length) {
        relationPromises.push(
          runQuery(supabase.from('title_aliases').insert(aliases)),
        );
      }

      if (selectedMoods.length) {
        relationPromises.push(
          runQuery(supabase.from('title_moods').insert(
            selectedMoods.map((mood_id) => ({ canonical_title_id: titleId, mood_id })),
          )),
        );
      }

      if (genres.length) {
        relationPromises.push(
          runQuery(supabase.from('title_genres').insert(
            genres.map((genre_name) => ({ canonical_title_id: titleId, genre_name })),
          )),
        );
      }

      if (tags.length) {
        relationPromises.push(
          runQuery(supabase.from('title_tags').insert(
            tags.map((tag_name) => ({ canonical_title_id: titleId, tag_name })),
          )),
        );
      }

      if (platforms.length) {
        relationPromises.push(
          runQuery(supabase.from('title_availability').insert(
            platforms.map((platform) => ({
              canonical_title_id: titleId,
              platform_name: platform.platform_name,
              region_code: platform.region_code || null,
              url: platform.url,
              is_official: true,
            })),
          )),
        );
      }

      await Promise.all(relationPromises);

      toast.success(isNew ? t('admin.titleEdit.titleCreated') : t('admin.titleEdit.titleUpdated'), { id: toastId });
      navigate('/admin/titles');
    } catch (error) {
      console.error('Error saving title:', error);
      toast.error(error.message || 'Save failed', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="admin-page-content" style={{ padding: 'var(--space-10)', textAlign: 'center' }}>{t('admin.common.loading')}</div>;
  }

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <button
            onClick={() => navigate('/admin/titles')}
            className="action-btn"
            style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-1) var(--space-3)' }}
            type="button"
          >
            Back
          </button>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>
            {isNew ? t('admin.titleEdit.createTitle') : t('admin.titleEdit.editTitle')}
          </h1>
          {!isNew && <p style={{ color: 'var(--text-secondary)' }}>{t('admin.titleEdit.catalogId', { id })}</p>}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="action-btn" onClick={() => navigate('/admin/titles')} type="button">
            {t('admin.common.cancel')}
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={isSaving} type="submit">
            {isSaving ? t('admin.common.saving') : t('admin.common.save')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="admin-form-container">
        <div className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
            {t('admin.titleEdit.basicMetadata')}
          </h2>

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

        <div className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
            {t('admin.titleEdit.discoveryMapping')}
          </h2>

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
              <input className="form-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="Magic, School Life" />
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
            {t('admin.titleEdit.availability')}
          </h2>

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

        <div className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
            {t('admin.titleEdit.catalogFields')}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
            <div>
              <label className="form-label">{t('admin.titleEdit.type')}</label>
              <select className="form-select" name="type" value={formData.type} onChange={handleInputChange} required>
                <option value="anime">Anime</option>
                <option value="manga">Manga</option>
                <option value="manhwa">Manhwa</option>
              </select>
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.status')}</label>
              <select className="form-select" name="status" value={formData.status} onChange={handleInputChange}>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="upcoming">Upcoming</option>
                <option value="hiatus">Hiatus</option>
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
              <input type="text" className="form-input" name="origin_country" value={formData.origin_country} onChange={handleInputChange} placeholder="JP, KR, CN" />
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.originLanguage')}</label>
              <input type="text" className="form-input" name="origin_language" value={formData.origin_language} onChange={handleInputChange} placeholder="ja, ko, zh" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--error)', fontWeight: 600 }}>
                <input type="checkbox" name="is_adult" checked={formData.is_adult} onChange={handleInputChange} />
                {t('admin.titleEdit.isAdult')}
              </label>
            </div>
          </div>
        </div>

        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-2)' }}>
            {t('admin.titleEdit.artwork')}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
            <div>
              <label className="form-label">{t('admin.titleEdit.coverUrl')}</label>
              <input type="text" className="form-input" name="cover_image" value={formData.cover_image} onChange={handleInputChange} />
              {formData.cover_image && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <img src={formData.cover_image} alt="Preview" style={{ width: '120px', borderRadius: '8px' }} />
                </div>
              )}
            </div>
            <div>
              <label className="form-label">{t('admin.titleEdit.bannerUrl')}</label>
              <input type="text" className="form-input" name="banner_image" value={formData.banner_image} onChange={handleInputChange} />
              {formData.banner_image && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <img src={formData.banner_image} alt="Preview" style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default AdminTitleEdit;
