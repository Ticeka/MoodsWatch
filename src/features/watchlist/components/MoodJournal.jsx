import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { MOODS, getLocalizedMoodName } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { fetchMoodJournalEntries, saveMoodJournalEntry } from '@/features/watchlist/api/moodJournalApi';

const TODAY = new Date().toISOString().slice(0, 10);

function toLocalDate(isoDate) {
  // isoDate is YYYY-MM-DD from Supabase (date column, no TZ)
  return isoDate;
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatDay(dateStr, language) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' });
}

export function MoodJournal() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [todayMoodId, setTodayMoodId] = useState(null);
  const [todayNote, setTodayNote] = useState('');

  const moodMap = new Map(MOODS.map((m) => [m.id, m]));

  const fetchEntries = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const thirtyDaysAgo = getLast30Days()[0];
      const data = await fetchMoodJournalEntries(user.id, thirtyDaysAgo);
      setEntries(data || []);

      const todayEntry = (data || []).find((e) => toLocalDate(e.logged_at) === TODAY);
      if (todayEntry) {
        setTodayMoodId(todayEntry.mood_id);
        setTodayNote(todayEntry.note || '');
      }
    } catch (err) {
      console.warn('Failed to load mood journal:', err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSave = async () => {
    if (!todayMoodId || !user) return;
    setSaving(true);
    try {
      await saveMoodJournalEntry({
        userId: user.id,
        moodId: todayMoodId,
        note: todayNote || null,
        loggedAt: TODAY,
      });
      toast.success(t('moodJournal.saved'));
      await fetchEntries();
    } catch (err) {
      console.warn('Failed to save mood journal:', err.message);
      toast.error(t('moodJournal.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const days = getLast30Days();
  const entryByDate = new Map(entries.map((e) => [toLocalDate(e.logged_at), e]));
  const todayEntry = entryByDate.get(TODAY);
  const hasChanged = todayMoodId && (todayMoodId !== todayEntry?.mood_id || todayNote !== (todayEntry?.note || ''));

  if (!user) {
    return (
      <div className="mood-journal-login-prompt">
        <span>🌸</span>
        <p>{t('moodJournal.loginPrompt')}</p>
      </div>
    );
  }

  return (
    <div className="mood-journal">
      {/* Today's log */}
      <div className="mood-journal-today glass-heavy">
        <div className="mood-journal-today-header">
          <div>
            <span className="mood-journal-eyebrow">{t('moodJournal.todayEyebrow')}</span>
            <h3>{t('moodJournal.todayTitle')}</h3>
          </div>
          {todayEntry && (
            <span
              className="mood-journal-today-badge"
              style={{ '--mood-color': moodMap.get(todayEntry.mood_id)?.color }}
            >
              {moodMap.get(todayEntry.mood_id)?.icon}{' '}
              {getLocalizedMoodName(moodMap.get(todayEntry.mood_id), language)}
            </span>
          )}
        </div>

        <div className="mood-journal-picker" role="group" aria-label={t('moodJournal.pickMood')}>
          {MOODS.map((mood) => (
            <button
              key={mood.id}
              className={`mood-journal-chip${todayMoodId === mood.id ? ' selected' : ''}`}
              style={{ '--mood-color': mood.color }}
              onClick={() => setTodayMoodId(mood.id === todayMoodId ? null : mood.id)}
              aria-pressed={todayMoodId === mood.id}
              title={getLocalizedMoodName(mood, language)}
            >
              <span>{mood.icon}</span>
              <span>{getLocalizedMoodName(mood, language)}</span>
            </button>
          ))}
        </div>

        {todayMoodId && (
          <textarea
            className="mood-journal-note"
            value={todayNote}
            onChange={(e) => setTodayNote(e.target.value)}
            placeholder={t('moodJournal.notePlaceholder')}
            rows={2}
            maxLength={200}
          />
        )}

        <div className="mood-journal-today-footer">
          <span className="mood-journal-date-label">
            {formatDay(TODAY, language)}
          </span>
          {todayMoodId && (
            <button
              className="mood-journal-save-btn"
              onClick={handleSave}
              disabled={saving || !hasChanged}
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          )}
        </div>
      </div>

      {/* 30-day calendar */}
      <div className="mood-journal-calendar">
        <div className="mood-journal-calendar-header">
          <h3>{t('moodJournal.calendarTitle')}</h3>
          <span>{t('moodJournal.calendarSubtitle')}</span>
        </div>
        {loading ? (
          <div className="mood-journal-loading">{t('common.loading')}</div>
        ) : (
          <div className="mood-journal-grid" role="list">
            {days.map((day) => {
              const entry = entryByDate.get(day);
              const mood = entry ? moodMap.get(entry.mood_id) : null;
              const isToday = day === TODAY;
              return (
                <div
                  key={day}
                  className={`mood-journal-day${isToday ? ' today' : ''}${mood ? ' has-mood' : ''}`}
                  style={mood ? { '--mood-color': mood.color } : {}}
                  role="listitem"
                  aria-label={`${formatDay(day, language)}${mood ? ': ' + getLocalizedMoodName(mood, language) : ''}`}
                  title={`${formatDay(day, language)}${mood ? '\n' + getLocalizedMoodName(mood, language) + (entry.note ? '\n' + entry.note : '') : ''}`}
                >
                  <span className="mood-journal-day-dot">
                    {mood ? mood.icon : ''}
                  </span>
                  <span className="mood-journal-day-num">
                    {new Date(day + 'T00:00:00').getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
