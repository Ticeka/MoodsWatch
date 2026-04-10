import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays, Check, Loader2, Plus, RefreshCw, Shuffle, Trash2, X } from 'lucide-react';
import { fetchAdminDailyChallengeData } from '@/features/admin/api';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const DAYS_AHEAD = 7;
const EMOJI_PRESETS = ['📅','⚔️','🏆','🌟','🔥','💥','🎯','🎭','🌸','🌊','❄️','🚀'];
const DAILY_CHALLENGE_QUERY_KEY = ['admin-daily-challenge-data'];

function getDateRange() {
  const dates = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const EMPTY_FORM = { theme_name_th: '', theme_name_en: '', theme_icon: '📅', deck_id: '' };

export function AdminDailyChallenge() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [editDate, setEditDate]       = useState(null); // date string being edited
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

  const dates = getDateRange();
  const dailyChallengeQuery = useQuery({
    queryKey: DAILY_CHALLENGE_QUERY_KEY,
    queryFn: () => fetchAdminDailyChallengeData(dates),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const challenges = useMemo(() => dailyChallengeQuery.data?.challengeMap || {}, [dailyChallengeQuery.data]);
  const decks = useMemo(() => dailyChallengeQuery.data?.decks || [], [dailyChallengeQuery.data]);

  async function refreshData() {
    const result = await dailyChallengeQuery.refetch();
    if (result.error) {
      toast.error(result.error.message);
    }
  }

  function openEdit(date) {
    const existing = challenges[date];
    setForm(existing
      ? { theme_name_th: existing.theme_name_th || '', theme_name_en: existing.theme_name_en || '', theme_icon: existing.theme_icon || '📅', deck_id: existing.deck_id || '' }
      : { ...EMPTY_FORM }
    );
    setEditDate(date);
  }

  async function saveChallenge() {
    if (!supabase || !editDate) return;
    setSaving(true);
    try {
      const existing = challenges[editDate];
      const payload = {
        challenge_date: editDate,
        theme_name_th:  form.theme_name_th.trim() || null,
        theme_name_en:  form.theme_name_en.trim() || null,
        theme_icon:     form.theme_icon || '📅',
        deck_id:        form.deck_id || null,
      };

      if (existing) {
        const { error } = await supabase.from('daily_challenges').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('daily_challenges').insert(payload);
        if (error) throw error;
      }

      toast.success(t('admin.daily.saved'));
      setEditDate(null);
      await queryClient.invalidateQueries({ queryKey: DAILY_CHALLENGE_QUERY_KEY });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteChallenge(date) {
    const existing = challenges[date];
    if (!existing || !supabase) return;
    if (!window.confirm(t('admin.daily.confirmDelete'))) return;
    const { error } = await supabase.from('daily_challenges').delete().eq('id', existing.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('admin.daily.deleted'));
    await queryClient.invalidateQueries({ queryKey: DAILY_CHALLENGE_QUERY_KEY });
  }

  async function autoFill() {
    if (!supabase || decks.length === 0) {
      toast.error(t('admin.daily.noDecksForAuto'));
      return;
    }
    setAutoFilling(true);
    try {
      const emptyDates = dates.filter((d) => !challenges[d]);
      if (emptyDates.length === 0) {
        toast(t('admin.daily.allFilled'));
        return;
      }

      const shuffled = [...decks].sort(() => Math.random() - 0.5);
      const rows = emptyDates.map((date, i) => {
        const deck = shuffled[i % shuffled.length];
        return {
          challenge_date: date,
          deck_id:        deck.id,
          theme_name_en:  deck.name,
          theme_name_th:  deck.name,
          theme_icon:     EMOJI_PRESETS[Math.floor(Math.random() * EMOJI_PRESETS.length)],
        };
      });

      const { error } = await supabase.from('daily_challenges').insert(rows);
      if (error) throw error;
      toast.success(t('admin.daily.autoFilled').replace('{n}', emptyDates.length));
      await queryClient.invalidateQueries({ queryKey: DAILY_CHALLENGE_QUERY_KEY });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAutoFilling(false);
    }
  }

  const TODAY = new Date().toISOString().slice(0, 10);

  return (
    <div className="admin-page-content">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <CalendarDays size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('admin.daily.title')}
          </h1>
          <p className="admin-page-subtitle">{t('admin.daily.subtitle')}</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={autoFill}
          disabled={autoFilling || dailyChallengeQuery.isLoading}
          type="button"
        >
          {autoFilling
            ? <Loader2 size={15} className="animate-spin" />
            : <Shuffle size={15} />
          }
          {t('admin.daily.autoFill')}
        </button>
      </div>

      {dailyChallengeQuery.isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : dailyChallengeQuery.error ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: '1rem' }}>{dailyChallengeQuery.error.message || t('admin.daily.loadFailed')}</p>
          <button className="action-btn" type="button" onClick={refreshData}>
            <RefreshCw size={15} />
            {t('admin.common.refresh')}
          </button>
        </div>
      ) : (
        <div className="admin-daily-grid">
          {dates.map((date) => {
            const challenge = challenges[date];
            const isToday   = date === TODAY;
            const isPast    = date < TODAY;
            const deck      = challenge?.deck_id ? decks.find((d) => d.id === challenge.deck_id) : null;

            return (
              <div
                key={date}
                className={`admin-daily-card${isToday ? ' today' : ''}${isPast ? ' past' : ''}`}
              >
                <div className="admin-daily-card-header">
                  <div className="admin-daily-date-wrap">
                    <span className="admin-daily-date">{date}</span>
                    {isToday && <span className="admin-daily-today-badge">{t('admin.daily.today')}</span>}
                  </div>
                  <div className="admin-daily-actions">
                    <button
                      className="action-btn"
                      onClick={() => openEdit(date)}
                      title={challenge ? t('admin.daily.edit') : t('admin.daily.set')}
                      type="button"
                    >
                      {challenge ? <RefreshCw size={14} /> : <Plus size={14} />}
                    </button>
                    {challenge && (
                      <button
                        className="action-btn"
                        style={{ color: 'var(--error)' }}
                        onClick={() => deleteChallenge(date)}
                        title={t('admin.daily.delete')}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {challenge ? (
                  <div className="admin-daily-challenge-info">
                    <span className="admin-daily-icon">{challenge.theme_icon}</span>
                    <div>
                      <p className="admin-daily-theme-th">{challenge.theme_name_th || '—'}</p>
                      <p className="admin-daily-theme-en">{challenge.theme_name_en || '—'}</p>
                      {deck && <p className="admin-daily-deck-name">🗂 {deck.name}</p>}
                    </div>
                  </div>
                ) : (
                  <p className="admin-daily-empty">{t('admin.daily.notSet')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit modal ── */}
      {editDate && (
        <div className="admin-modal-overlay" onClick={() => setEditDate(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>{challenges[editDate] ? t('admin.daily.editChallenge') : t('admin.daily.newChallenge')}</h2>
              <button className="action-btn" onClick={() => setEditDate(null)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <p className="admin-daily-modal-date">{editDate}</p>

            <div className="form-group">
              <label className="form-label">{t('admin.daily.emojiIcon')}</label>
              <div className="admin-daily-emoji-grid">
                {EMOJI_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`admin-daily-emoji-btn${form.theme_icon === em ? ' selected' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, theme_icon: em }))}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.daily.themeNameTh')}</label>
              <input
                className="form-input"
                value={form.theme_name_th}
                onChange={(e) => setForm((f) => ({ ...f, theme_name_th: e.target.value }))}
                placeholder="ธีมภาษาไทย"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.daily.themeNameEn')}</label>
              <input
                className="form-input"
                value={form.theme_name_en}
                onChange={(e) => setForm((f) => ({ ...f, theme_name_en: e.target.value }))}
                placeholder="English theme name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('admin.daily.deck')}</label>
              <select
                className="form-input"
                value={form.deck_id}
                onChange={(e) => setForm((f) => ({ ...f, deck_id: e.target.value }))}
              >
                <option value="">{t('admin.daily.noDeck')}</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="admin-modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditDate(null)} type="button">
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={saveChallenge} disabled={saving} type="button">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDailyChallenge;
