import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, UserRound, Sparkles, ArrowLeft } from 'lucide-react';
import { BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from '@/shared/config/brand';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import lightThemeBg from '@/assets/ligh-theme.jpeg';
import darkThemeBg from '@/assets/dark-theme.jpg';
import { useTheme } from '@/shared/contexts/ThemeContext';
import './Auth.css';

export function Auth() {
  const { signInWithEmail, signUpWithEmail, user, isLoading } = useAuth();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isDark = theme === 'dark';

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
      <div className="auth-root">
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
          <p>{t('auth.loadingUser')}</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="auth-root">
      {/* Left decorative panel */}
      <div className="auth-panel-left">
        <div
          className={`auth-panel-bg ${isDark ? 'is-hidden' : 'is-active'}`}
          style={{ backgroundImage: `url(${lightThemeBg})` }}
          aria-hidden="true"
        />
        <div
          className={`auth-panel-bg ${isDark ? 'is-active' : 'is-hidden'}`}
          style={{ backgroundImage: `url(${darkThemeBg})` }}
          aria-hidden="true"
        />

        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Sparkles size={20} />
          </span>
          <span className="auth-brand-name">
            {BRAND_WORDMARK_LEAD}
            <span className="auth-brand-accent">{BRAND_WORDMARK_ACCENT}</span>
          </span>
        </div>

        <div className="auth-panel-footer-dots">
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-panel-right">
        <Link to="/" className="auth-back">
          <ArrowLeft size={16} />
          {t('titleDetail.backHome')}
        </Link>

        <div className="auth-form-wrapper animate-auth-in">
          <div className="auth-form-head">
            <p className="auth-eyebrow">
              {isLogin ? t('auth.signIn') : t('auth.signUp')}
            </p>
            <h2>{isLogin ? t('auth.welcomeBack') : t('auth.createCozyAccount')}</h2>
            <p className="auth-subhead">
              {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
              <button type="button" className="auth-toggle-link" onClick={() => setIsLogin((v) => !v)}>
                {isLogin ? t('auth.signUpNow') : t('auth.signInNow')}
              </button>
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <span className="auth-error-dot" />
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="auth-field">
                <label className="auth-field-label">{t('auth.username')}</label>
                <div className="auth-input-wrap">
                  <UserRound size={17} className="auth-input-icon" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={!isLogin}
                    placeholder={t('auth.usernamePlaceholder')}
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label className="auth-field-label">{t('auth.email')}</label>
              <div className="auth-input-wrap">
                <Mail size={17} className="auth-input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t('auth.emailPlaceholder')}
                />
              </div>
            </div>

            <div className="auth-field">
              <div className="auth-field-row">
                <label className="auth-field-label">{t('auth.password')}</label>
                {isLogin && (
                  <button type="button" className="auth-forgot">
                    {t('auth.forgotPassword') || 'Forgot password?'}
                  </button>
                )}
              </div>
              <div className="auth-input-wrap">
                <Lock size={17} className="auth-input-icon" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder={t('auth.passwordHint')}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? isLogin
                  ? t('common.loading')
                  : t('auth.creating')
                : isLogin
                  ? t('auth.signIn')
                  : t('auth.signUp')}
            </button>
          </form>

          <p className="auth-footnote">
            {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
            <button type="button" className="auth-toggle-link" onClick={() => setIsLogin((v) => !v)}>
              {isLogin ? t('auth.signUpNow') : t('auth.signInNow')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Auth;