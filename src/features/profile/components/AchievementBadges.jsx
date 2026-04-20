import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/AchievementBadges.css';

export function AchievementBadges({ userId, variant = 'default' }) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [allAchievements, setAllAchievements] = useState([]);
  const [earned, setEarned] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const targetUserId = userId || user?.id;

  const fetchAchievements = useCallback(async () => {
    if (!supabase || !targetUserId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: all }, { data: userEarned }] = await Promise.all([
        supabase.from('achievements').select('*').order('sort_order'),
        supabase.from('user_achievements').select('achievement_id, earned_at').eq('user_id', targetUserId),
      ]);
      setAllAchievements(all || []);
      setEarned(new Map((userEarned || []).map((r) => [r.achievement_id, r.earned_at])));
    } catch (err) {
      console.warn('Failed to load achievements:', err.message);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  if (loading) return <div className="achievements-loading">{t('common.loading')}</div>;
  if (allAchievements.length === 0) return null;

  const earnedCount = earned.size;
  const total = allAchievements.length;

  if (variant === 'mw') {
    return (
      <section className="profile-mw-badges">
        <div className="profile-mw-badges-head">
          <div className="profile-mw-section-kicker">
            {t('achievements.title')} · {earnedCount} {language === 'th' ? 'ได้รับแล้ว' : 'earned'}
          </div>
          <span className="profile-mw-badges-count">{earnedCount} / {total}</span>
        </div>
        <div className="profile-mw-badges-bar">
          <div className="profile-mw-badges-bar-fill" style={{ width: `${(earnedCount / total) * 100}%` }} />
        </div>
        <div className="profile-mw-badges-grid">
          {allAchievements.map((ach) => {
            const isEarned = earned.has(ach.id);
            const earnedAt = earned.get(ach.id);
            const name = language === 'th' ? ach.name_th : ach.name_en;
            const description = language === 'th' ? ach.description_th : ach.description_en;
            return (
              <div
                key={ach.id}
                className={`profile-mw-badge ${isEarned ? 'earned' : 'locked'}`}
                title={`${name}${description ? '\n' + description : ''}${earnedAt ? '\n' + new Date(earnedAt).toLocaleDateString() : ''}`}
                aria-label={`${name}${isEarned ? '' : ' — ' + t('achievements.locked')}`}
              >
                <span className="profile-mw-badge-icon">{ach.icon}</span>
                <span className="profile-mw-badge-name">{name}</span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="achievements-section">
      <div className="achievements-header">
        <h3 className="achievements-title">
          🏆 {t('achievements.title')}
        </h3>
        <span className="achievements-progress">
          {earnedCount} / {total}
        </span>
      </div>

      <div className="achievements-progress-bar">
        <div
          className="achievements-progress-fill"
          style={{ width: `${(earnedCount / total) * 100}%` }}
          role="progressbar"
          aria-valuenow={earnedCount}
          aria-valuemax={total}
        />
      </div>

      <div className="achievements-grid">
        {allAchievements.map((ach) => {
          const isEarned = earned.has(ach.id);
          const earnedAt = earned.get(ach.id);
          const name = language === 'th' ? ach.name_th : ach.name_en;
          const description = language === 'th' ? ach.description_th : ach.description_en;
          return (
            <div
              key={ach.id}
              className={`achievement-badge${isEarned ? ' earned' : ' locked'}`}
              title={`${name}${description ? '\n' + description : ''}${earnedAt ? '\n' + new Date(earnedAt).toLocaleDateString() : ''}`}
              aria-label={`${name}${isEarned ? '' : ' — ' + t('achievements.locked')}`}
            >
              <span className="achievement-icon">{ach.icon}</span>
              <span className="achievement-name">{name}</span>
              {isEarned && <span className="achievement-check">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
