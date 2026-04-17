import React from 'react';
import { Disc3, Swords, ListOrdered, Eye, Hash, Play, Youtube, Film, Music2 } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';

function formatCount(n) {
  if (!n) return '0';
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

/* ─── Placeholder แสดงไอคอนแทนรูปที่ไม่มี ─── */
function CardPlaceholder({ icon: Icon, variant = 'default' }) {
  return (
    <div className={`hv2-placeholder hv2-placeholder--${variant}`}>
      <Icon size={36} strokeWidth={1.5} />
    </div>
  );
}

function getPartyPlaceholderIcon(sourceType, modeScope) {
  if (sourceType === 'youtube') return Youtube;
  if (modeScope === 'vote') return Music2;
  return Disc3;
}

function getPartyPlaceholderVariant(sourceType) {
  if (sourceType === 'youtube') return 'youtube';
  return 'party';
}

/* ─── Cards ─── */

export function PartyCard({ template, onClick }) {
  const { language, pick } = useLanguage();
  const coverUrl = template.coverUrl || '';
  const PlaceholderIcon = getPartyPlaceholderIcon(template.sourceType, template.modeScope);
  const variant = getPartyPlaceholderVariant(template.sourceType);
  const creatorName = template.creatorName || pick('คอมมูนิตี้', 'Community');
  const templateName = (language === 'th' ? template.nameTh : null) || template.name;

  return (
    <div className="hv2-card" onClick={onClick}>
      <div className="hv2-card-img">
        {coverUrl
          ? <img src={coverUrl} alt={templateName} loading="lazy" />
          : <CardPlaceholder icon={PlaceholderIcon} variant={variant} />
        }
        <span className="hv2-badge hv2-badge--party"><Disc3 size={11} /> {pick('ปาร์ตี้', 'Party')}</span>
      </div>
      <div className="hv2-card-body">
        <h3 className="hv2-card-title">{templateName}</h3>
        <p className="hv2-card-sub">{creatorName}</p>
        <div className="hv2-card-meta">
          {template.itemCount > 0 && <span className="hv2-meta"><Hash size={11} />{template.itemCount}</span>}
          {template.viewCount > 0 && <span className="hv2-meta"><Eye size={11} />{formatCount(template.viewCount)}</span>}
        </div>
      </div>
    </div>
  );
}

export function BattleCard({ deck, onClick }) {
  const { pick } = useLanguage();
  // titles_snapshot stores raw DB rows with cover_image field
  const firstTitle = deck.titles?.[0];
  const coverUrl = firstTitle?.cover_image || firstTitle?.cover || '';
  const name = deck.label || '';
  const count = deck.sourceCount || deck.titles?.length || 0;
  const ownerName = deck.ownerDisplayName || pick('คอมมูนิตี้', 'Community');

  return (
    <div className="hv2-card" onClick={onClick}>
      <div className="hv2-card-img">
        {coverUrl
          ? <img src={coverUrl} alt={name} loading="lazy" />
          : <CardPlaceholder icon={Film} variant="battle" />
        }
        <span className="hv2-badge hv2-badge--battle"><Swords size={11} /> {pick('แบทเทิล', 'Battle')}</span>
      </div>
      <div className="hv2-card-body">
        <h3 className="hv2-card-title">{name}</h3>
        <p className="hv2-card-sub">{ownerName}</p>
        <div className="hv2-card-meta">
          {count > 0 && <span className="hv2-meta"><Hash size={11} />{count}</span>}
          {deck.playCount > 0 && <span className="hv2-meta"><Eye size={11} />{formatCount(deck.playCount)}</span>}
        </div>
      </div>
    </div>
  );
}

export function TierlistCard({ template, onClick }) {
  const { pick } = useLanguage();
  const coverUrl = template.manualPreviewArtworkUrl || template.previewArtworkUrl || '';
  const category = template.category || pick('คอมมูนิตี้', 'Community');
  return (
    <div className="hv2-card" onClick={onClick}>
      <div className="hv2-card-img">
        {coverUrl
          ? <img src={coverUrl} alt={template.title} loading="lazy" style={{ objectFit: template.previewArtworkFit || 'cover', objectPosition: template.previewArtworkPosition || 'center' }} />
          : <CardPlaceholder icon={ListOrdered} variant="tierlist" />
        }
        <span className="hv2-badge hv2-badge--tierlist"><ListOrdered size={11} /> {pick('เทียร์ลิสต์', 'Tierlist')}</span>
      </div>
      <div className="hv2-card-body">
        <h3 className="hv2-card-title">{template.title}</h3>
        <p className="hv2-card-sub">{category}</p>
        <div className="hv2-card-meta">
          {template.plays > 0 && <span className="hv2-meta"><Play size={11} />{formatCount(template.plays)}</span>}
        </div>
      </div>
    </div>
  );
}

export function TrendingCard({ title, rank, onClick }) {
  const { language, pick } = useLanguage();
  const coverUrl = title.cover || title.cover_image || '';
  const name = (language === 'th' ? title.title_th : null)
    || title.title_en
    || title.canonicalTitle
    || title.canonical_title
    || '';
  const localizedType = title.type === 'anime'
    ? pick('อนิเมะ', 'Anime')
    : title.type === 'manga'
      ? pick('มังงะ', 'Manga')
      : title.type === 'manhwa'
        ? pick('มันฮวา', 'Manhwa')
        : title.type || pick('เรื่องแนะนำ', 'Title');
  return (
    <div className="hv2-card" onClick={onClick}>
      <div className="hv2-card-img">
        {coverUrl
          ? <img src={coverUrl} alt={name} loading="lazy" />
          : <CardPlaceholder icon={Film} variant="battle" />
        }
        {rank != null && <span className="hv2-rank">#{rank}</span>}
      </div>
      <div className="hv2-card-body">
        <h3 className="hv2-card-title">{name}</h3>
        <p className="hv2-card-sub">{localizedType}</p>
      </div>
    </div>
  );
}
