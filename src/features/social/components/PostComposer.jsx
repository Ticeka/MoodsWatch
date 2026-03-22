import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Image, Loader2, Search, Send, X } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './PostComposer.css';

const MAX_CHARS = 1000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function PostComposer({ onPosted }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [content, setContent]             = useState('');
  const [taggedTitle, setTaggedTitle]     = useState(null);
  const [titleSearch, setTitleSearch]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch]       = useState(false);
  const [submitting, setSubmitting]       = useState(false);

  // Image state
  const [imageFile, setImageFile]         = useState(null);   // File object
  const [imagePreview, setImagePreview]   = useState(null);   // object URL
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const searchRef  = useRef(null);
  const photoInput = useRef(null);

  const userLabel  = user?.profile?.name || user?.email?.split('@')[0] || '';
  const userAvatar = user?.profile?.avatar_url;
  const initial    = userLabel.charAt(0).toUpperCase();

  async function handleTitleSearch(q) {
    setTitleSearch(q);
    if (!q.trim() || !supabase) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('canonical_titles')
      .select('id, canonical_title, slug, cover_image, banner_image, type')
      .ilike('canonical_title', `%${q}%`)
      .limit(6);
    setSearchResults(data || []);
  }

  function selectTitle(title) {
    setTaggedTitle(title);
    setTitleSearch('');
    setSearchResults([]);
    setShowSearch(false);
  }

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t('post.photoTypeError'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('post.photoTooBig'));
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  async function uploadPhoto(userId) {
    if (!imageFile || !supabase) return null;
    setUploadingPhoto(true);
    const ext  = imageFile.name.split('.').pop() || 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('post-images')
      .upload(path, imageFile, { cacheControl: '31536000', upsert: false });
    setUploadingPhoto(false);
    if (error) { toast.error(error.message); return null; }
    const { data } = supabase.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = content.trim();
    if ((!body && !imageFile) || !user || !supabase) return;
    setSubmitting(true);

    let imageUrl = null;
    if (imageFile) {
      imageUrl = await uploadPhoto(user.id);
      if (!imageUrl) { setSubmitting(false); return; }
    }

    const { error } = await supabase
      .from('social_posts')
      .insert({
        user_id:   user.id,
        content:   body,
        title_id:  taggedTitle?.id ?? null,
        image_url: imageUrl,
      });

    if (!error) {
      setContent('');
      setTaggedTitle(null);
      removePhoto();
      onPosted?.();
    }
    setSubmitting(false);
  }

  if (!user) return null;

  const remaining = MAX_CHARS - content.length;
  const coverImg  = taggedTitle?.cover_image || null;
  const blurImg   = taggedTitle?.banner_image || coverImg;
  const canPost   = (content.trim().length > 0 || imageFile) && !submitting;

  return (
    <div className="post-composer">

      {/* ── Avatar + textarea ── */}
      <div className="composer-top">
        {userAvatar ? (
          <img src={userAvatar} alt="" className="composer-avatar" />
        ) : (
          <div className="composer-avatar fallback">{initial}</div>
        )}

        <form className="composer-form" onSubmit={handleSubmit} id="composer-form">
          <textarea
            className="composer-textarea"
            placeholder={t('post.composerPlaceholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={MAX_CHARS}
            rows={3}
            disabled={submitting}
          />

          {/* Image preview */}
          {imagePreview && (
            <div className="composer-image-preview">
              <img src={imagePreview} alt="" className="composer-image-img" />
              <button
                type="button"
                className="composer-image-remove"
                onClick={removePhoto}
                aria-label={t('post.removePhoto')}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Tagged title preview */}
          {taggedTitle && coverImg && (
            <div className="composer-tagged-preview">
              <div
                className="composer-tagged-blur-bg"
                style={{ backgroundImage: `url(${blurImg || coverImg})` }}
              />
              <img src={coverImg} alt={taggedTitle.canonical_title} className="composer-tagged-cover" />
              <div className="composer-tagged-info">
                <span className="composer-tagged-name">{taggedTitle.canonical_title}</span>
                <button
                  type="button"
                  className="composer-tagged-remove"
                  onClick={() => setTaggedTitle(null)}
                  aria-label={t('post.removeTag')}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="composer-divider" />

      {/* ── Toolbar ── */}
      <div className="composer-footer">
        <div className="composer-tools">
          {/* Photo button */}
          <button
            type="button"
            className={`composer-tool-btn${imageFile ? ' active' : ''}`}
            onClick={() => photoInput.current?.click()}
            disabled={submitting || uploadingPhoto}
          >
            {uploadingPhoto
              ? <Loader2 size={16} className="animate-spin" />
              : <Image size={16} />
            }
            <span>{uploadingPhoto ? t('post.uploadingPhoto') : t('post.addPhoto')}</span>
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handlePhotoSelect}
          />

          {/* Tag title button */}
          <button
            type="button"
            className={`composer-tool-btn${showSearch ? ' active' : ''}`}
            onClick={() => {
              setShowSearch((v) => !v);
              setTimeout(() => searchRef.current?.focus(), 50);
            }}
          >
            <Search size={16} />
            <span>{t('post.tagTitle')}</span>
          </button>
        </div>

        <div className="composer-right">
          {content.length > 0 && (
            <span className={`composer-chars${remaining < 80 ? ' warn' : ''}`}>
              {remaining}
            </span>
          )}
          <button
            className="composer-submit"
            type="submit"
            form="composer-form"
            disabled={!canPost}
          >
            <Send size={14} />
            <span>{t('post.post')}</span>
          </button>
        </div>
      </div>

      {/* ── Title search ── */}
      {showSearch && (
        <div className="composer-title-search">
          <input
            ref={searchRef}
            className="composer-title-input"
            placeholder={t('post.searchTitlePlaceholder')}
            value={titleSearch}
            onChange={(e) => handleTitleSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <ul className="composer-title-results">
              {searchResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="composer-title-result-btn"
                    onClick={() => selectTitle(r)}
                  >
                    {r.cover_image && (
                      <img src={r.cover_image} alt="" className="composer-result-cover" />
                    )}
                    <span>{r.canonical_title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
