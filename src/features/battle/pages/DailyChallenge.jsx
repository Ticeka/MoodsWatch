import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { CalendarDays, Trophy, CheckCircle2, Swords } from 'lucide-react';
import '../styles/DailyChallenge.css';

const TODAY = new Date().toISOString().slice(0, 10);

export function DailyChallenge() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  const fetchChallenge = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: challengeData } = await supabase
        .from('daily_challenges')
        .select('id, challenge_date, theme_name_th, theme_name_en, theme_icon, deck_id')
        .eq('challenge_date', TODAY)
        .maybeSingle();

      setChallenge(challengeData || null);

      if (user && challengeData) {
        const { data: completion } = await supabase
          .from('daily_challenge_completions')
          .select('id')
          .eq('user_id', user.id)
          .eq('challenge_date', TODAY)
          .maybeSingle();
        setCompleted(!!completion);

        // Calculate streak: count consecutive days with completions
        const { data: recentCompletions } = await supabase
          .from('daily_challenge_completions')
          .select('challenge_date')
          .eq('user_id', user.id)
          .order('challenge_date', { ascending: false })
          .limit(30);

        let streakCount = 0;
        let expectedDate = new Date();
        for (const comp of (recentCompletions || [])) {
          const expected = expectedDate.toISOString().slice(0, 10);
          if (comp.challenge_date === expected) {
            streakCount++;
            expectedDate.setDate(expectedDate.getDate() - 1);
          } else {
            break;
          }
        }
        setStreak(streakCount);
      }
    } catch (err) {
      console.warn('Failed to load daily challenge:', err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  const handlePlay = () => {
    if (challenge?.deck_id) {
      navigate(`/battle/session?deck=${challenge.deck_id}&daily=${TODAY}`);
    } else {
      navigate('/battle');
    }
  };

  const displayDate = new Date(TODAY + 'T00:00:00').toLocaleDateString(
    language === 'th' ? 'th-TH' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' }
  );

  return (
    <div className="daily-challenge-page animate-fade-in">
      <section className="section">
        <div className="container">
          <div className="daily-challenge-hero glass-heavy">
            <div className="daily-challenge-top">
              <span className="daily-challenge-eyebrow">
                <CalendarDays size={14} /> {t('dailyChallenge.eyebrow')}
              </span>
              <span className="daily-challenge-date">{displayDate}</span>
            </div>

            {loading ? (
              <div className="daily-challenge-loading">{t('common.loading')}</div>
            ) : !challenge ? (
              <div className="daily-challenge-no-challenge">
                <Swords size={48} opacity={0.2} />
                <h2>{t('dailyChallenge.noChallengeTitle')}</h2>
                <p>{t('dailyChallenge.noChallengeHint')}</p>
              </div>
            ) : (
              <>
                <div className="daily-challenge-theme">
                  <span className="daily-challenge-theme-icon">{challenge.theme_icon}</span>
                  <div>
                    <p className="daily-challenge-theme-label">{t('dailyChallenge.todayTheme')}</p>
                    <h2 className="daily-challenge-theme-name">
                      {language === 'th' ? challenge.theme_name_th : challenge.theme_name_en}
                    </h2>
                  </div>
                </div>

                {completed ? (
                  <div className="daily-challenge-completed">
                    <CheckCircle2 size={32} className="daily-challenge-check" />
                    <h3>{t('dailyChallenge.completedTitle')}</h3>
                    <p>{t('dailyChallenge.completedHint')}</p>
                  </div>
                ) : (
                  <button
                    className="daily-challenge-play-btn"
                    onClick={handlePlay}
                    disabled={!user}
                  >
                    <Swords size={20} />
                    {user ? t('dailyChallenge.playNow') : t('dailyChallenge.loginToPlay')}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Streak display */}
          {user && streak > 0 && (
            <div className="daily-streak-card glass-heavy">
              <Trophy size={20} className="daily-streak-icon" />
              <div>
                <span className="daily-streak-label">{t('dailyChallenge.streakLabel')}</span>
                <strong className="daily-streak-count">{streak} {t('dailyChallenge.streakDays')}</strong>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default DailyChallenge;
