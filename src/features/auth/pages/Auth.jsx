import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, UserRound, Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import './Auth.css';

export function Auth() {
  const { signInWithEmail, signUpWithEmail, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoading && user) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isLoading, user, location.state, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const from = location.state?.from?.pathname || '/';

      if (isLogin) {
        await signInWithEmail(email, password);
        navigate(from, { replace: true });
      } else {
        await signUpWithEmail(email, password, username);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message || t('auth.genericError'));
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <section className="auth-page auth-loading-state">
        <div className="container">
          <div className="auth-shell glass-heavy">
            <p>{t('auth.loadingUser')}</p>
          </div>
        </div>
      </section>
    );
  }

  if (user) {
    return null;
  }

  return (
    <section className="auth-page">
      <div className="auth-orb auth-orb-left" />
      <div className="auth-orb auth-orb-right" />

      <div className="container auth-layout">
        <div className="auth-story animate-fade-in-up">
          <span className="auth-kicker">
            <Sparkles size={14} />
            MoodToon
          </span>
          <h1>{isLogin ? t('auth.signIn') : t('auth.signUp')}</h1>
          <p>
            Cute, friendly recommendations feel better when your list, favorites, and progress follow you everywhere.
          </p>
          <div className="auth-story-pills">
            <span>Save your watchlist</span>
            <span>Sync favorites</span>
            <span>Shape recommendations</span>
          </div>
          <Link to="/" className="auth-back-link">
            {t('titleDetail.backHome')}
          </Link>
        </div>

        <div className="auth-shell glass-heavy animate-scale-in">
          <div className="auth-card-bar" />

          <div className="auth-mobile-brand">
            <span className="logo-icon logo-icon-sm"><Sparkles size={15} /></span>
            <span className="logo-wordmark">Mood<span className="logo-accent">Toon</span></span>
          </div>

          <div className="auth-shell-head">
            <div>
              <span className="auth-panel-eyebrow">{isLogin ? t('auth.signIn') : t('auth.signUp')}</span>
              <h2>{isLogin ? 'Welcome back' : 'Create your cozy account'}</h2>
            </div>
            <button
              type="button"
              className="auth-switch"
              onClick={() => setIsLogin((current) => !current)}
            >
              {isLogin ? t('auth.signUpNow') : t('auth.signInNow')}
            </button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            {!isLogin && (
              <label className="auth-field">
                <span>{t('auth.username')}</span>
                <div className="auth-input-shell">
                  <UserRound size={18} />
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required={!isLogin}
                    placeholder="AnimeFan99"
                  />
                </div>
              </label>
            )}

            <label className="auth-field">
              <span>{t('auth.email')}</span>
              <div className="auth-input-shell">
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="you@example.com"
                />
              </div>
            </label>

            <label className="auth-field">
              <span>{t('auth.password')}</span>
              <div className="auth-input-shell">
                <Lock size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  placeholder={t('auth.passwordHint')}
                />
              </div>
            </label>

            <Button type="submit" size="lg" fullWidth disabled={loading}>
              {loading
                ? (isLogin ? t('common.loading') : t('auth.creating'))
                : (isLogin ? t('auth.signIn') : t('auth.signUp'))}
            </Button>
          </form>

          <p className="auth-footnote">
            {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
            <button type="button" onClick={() => setIsLogin((current) => !current)}>
              {isLogin ? t('auth.signUpNow') : t('auth.signInNow')}
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}

export default Auth;
