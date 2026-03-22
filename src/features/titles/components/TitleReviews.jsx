import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { MessageSquare, AlertTriangle, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';

const MAX_LEN = 500;

const SCORE_META = [
  null,
  { emoji: '😣', label: 'Awful',     color: '#ef4444' },
  { emoji: '😞', label: 'Bad',       color: '#f97316' },
  { emoji: '😟', label: 'Poor',      color: '#f97316' },
  { emoji: '😕', label: 'Meh',       color: '#eab308' },
  { emoji: '😶', label: 'Average',   color: '#eab308' },
  { emoji: '😐', label: 'Okay',      color: '#84cc16' },
  { emoji: '🙂', label: 'Good',      color: '#22c55e' },
  { emoji: '😊', label: 'Great',     color: '#10b981' },
  { emoji: '😍', label: 'Excellent', color: '#3b82f6' },
  { emoji: '🤩', label: 'Perfect',   color: '#a855f7' },
];

function getScoreMeta(score) {
  if (score == null) return null;
  const s = Math.max(1, Math.min(10, Math.round(score / 10)));
  return SCORE_META[s];
}

function ReviewAvatar({ username, avatarUrl }) {
  const letter = (username || '?')[0].toUpperCase();
  return avatarUrl ? (
    <img src={avatarUrl} alt={username || ''} className="review-avatar review-avatar--img" />
  ) : (
    <div className="review-avatar" aria-hidden="true">{letter}</div>
  );
}

function ScorePill({ score }) {
  const meta = getScoreMeta(score);
  if (!meta) return null;
  const s = Math.round(score / 10);
  return (
    <span
      className="review-score-badge"
      style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}40` }}
    >
      {meta.emoji} {s}/10
    </span>
  );
}

function ReviewCard({ review, isOwn, onEdit, onDelete }) {
  const { t } = useLanguage();
  const [showSpoiler, setShowSpoiler] = useState(false);
  const date = new Date(review.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className={`review-card${isOwn ? ' review-card--own' : ''}`}>
      <div className="review-card-header">
        <ReviewAvatar username={review.username} avatarUrl={review.avatar_url} />
        <div className="review-card-meta">
          <span className="review-username">{review.username || t('reviews.anonymousUser')}</span>
          <span className="review-date">{date}</span>
        </div>
        <ScorePill score={review.score} />
        {isOwn && (
          <div className="review-card-actions">
            <button className="review-action-btn" onClick={onEdit} aria-label={t('reviews.edit')}>
              <Pencil size={13} />
            </button>
            <button className="review-action-btn review-action-btn--danger" onClick={onDelete} aria-label={t('reviews.delete')}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {review.spoiler && !showSpoiler ? (
        <div className="review-spoiler-blur">
          <span><AlertTriangle size={14} /> {t('reviews.spoilerWarning')}</span>
          <button className="review-spoiler-toggle" onClick={() => setShowSpoiler(true)}>
            <Eye size={13} /> {t('reviews.showSpoiler')}
          </button>
        </div>
      ) : (
        review.body ? (
          <div className="review-body">
            <p>{review.body}</p>
            {review.spoiler && (
              <button className="review-spoiler-toggle subtle" onClick={() => setShowSpoiler(false)}>
                <EyeOff size={12} /> {t('reviews.hideSpoiler')}
              </button>
            )}
          </div>
        ) : null
      )}
    </div>
  );
}

function ReviewForm({ titleId, existingReview, userScore, onSaved, onCancel }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [body, setBody] = useState(existingReview?.body || '');
  const [spoiler, setSpoiler] = useState(existingReview?.spoiler || false);
  const [saving, setSaving] = useState(false);
  const remaining = MAX_LEN - body.length;
  const valid = body.trim().length > 0;

  const scoreMeta = getScoreMeta(userScore);
  const scoreDisplay = userScore != null ? Math.round(userScore / 10) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid || !user) return;
    setSaving(true);
    try {
      const payload = {
        title_id: titleId,
        user_id: user.id,
        body: body.trim(),
        spoiler,
      };

      const { error } = existingReview
        ? await supabase.from('title_reviews').update({ body: payload.body, spoiler: payload.spoiler }).eq('id', existingReview.id)
        : await supabase.from('title_reviews').insert(payload);

      if (error) throw error;
      if (!existingReview) {
        void supabase.from('user_activity').insert({
          user_id: user.id,
          action_type: 'reviewed',
          title_id: titleId,
          metadata: {},
        });
      }
      toast.success(t(existingReview ? 'reviews.updated' : 'reviews.posted'));
      onSaved();
    } catch (err) {
      console.warn('Review save failed:', err.message);
      toast.error(t('reviews.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      {scoreDisplay != null && scoreMeta && (
        <div className="review-form-score-banner" style={{ '--score-color': scoreMeta.color }}>
          <span className="review-form-score-emoji">{scoreMeta.emoji}</span>
          <div className="review-form-score-info">
            <span className="review-form-score-label">{t('reviews.yourScore')}</span>
            <span className="review-form-score-value">{scoreDisplay}/10 · {scoreMeta.label}</span>
          </div>
        </div>
      )}

      <textarea
        className="review-form-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('reviews.placeholder')}
        rows={4}
        maxLength={MAX_LEN}
        aria-label={t('reviews.yourReview')}
      />

      <div className="review-form-footer">
        <label className="review-spoiler-label">
          <input
            type="checkbox"
            checked={spoiler}
            onChange={(e) => setSpoiler(e.target.checked)}
          />
          <AlertTriangle size={13} />
          {t('reviews.markSpoiler')}
        </label>
        <span className={`review-char-count${remaining < 50 ? ' review-char-count--warn' : ''}`}>
          {remaining}
        </span>
        <div className="review-form-btns">
          {onCancel && (
            <button type="button" className="review-btn-cancel" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" className="review-btn-submit" disabled={!valid || saving}>
            {saving ? t('common.loading') : t(existingReview ? 'reviews.update' : 'reviews.post')}
          </button>
        </div>
      </div>
    </form>
  );
}

export function TitleReviews({ titleId }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { getItem } = useWatchlist();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReview, setEditingReview] = useState(null);

  const userScore = getItem(titleId)?.score ?? null;

  const fetchReviews = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('title_reviews')
        .select('id, user_id, body, spoiler, score, created_at')
        .eq('title_id', titleId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      const rows = data || [];

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      let usernameMap = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);
        (profiles || []).forEach((p) => { usernameMap[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
      }

      setReviews(rows.map((r) => ({
        ...r,
        username: usernameMap[r.user_id]?.username || null,
        avatar_url: usernameMap[r.user_id]?.avatar_url || null,
      })));
    } catch (err) {
      console.warn('Failed to load reviews:', err.message);
    } finally {
      setLoading(false);
    }
  }, [titleId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleDelete = async (reviewId) => {
    if (!window.confirm(t('reviews.confirmDelete'))) return;
    try {
      const { error } = await supabase.from('title_reviews').delete().eq('id', reviewId);
      if (error) throw error;
      toast.success(t('reviews.deleted'));
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      toast.error(t('reviews.deleteFailed'));
    }
  };

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;
  const canWrite = user && !myReview;

  return (
    <section className="title-reviews-section">
      <div className="title-reviews-header">
        <h3 className="title-reviews-title">
          <MessageSquare size={18} aria-hidden="true" />
          {t('reviews.sectionTitle')}
          {reviews.length > 0 && (
            <span className="title-reviews-count">{reviews.length}</span>
          )}
        </h3>
        {canWrite && !showForm && (
          <button className="review-write-btn" onClick={() => setShowForm(true)}>
            {t('reviews.writeReview')}
          </button>
        )}
      </div>

      {(showForm || editingReview) && (
        <ReviewForm
          titleId={titleId}
          existingReview={editingReview}
          userScore={userScore}
          onSaved={() => { setShowForm(false); setEditingReview(null); fetchReviews(); }}
          onCancel={() => { setShowForm(false); setEditingReview(null); }}
        />
      )}

      {loading ? (
        <div className="title-reviews-loading">{t('common.loading')}</div>
      ) : reviews.length === 0 ? (
        <div className="title-reviews-empty">
          <MessageSquare size={28} opacity={0.3} />
          <p>{t('reviews.noReviews')}</p>
          {user && !showForm && (
            <button className="review-write-btn" onClick={() => setShowForm(true)}>
              {t('reviews.beFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="title-reviews-list">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isOwn={user?.id === review.user_id}
              onEdit={() => { setEditingReview(review); setShowForm(false); }}
              onDelete={() => handleDelete(review.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
