import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Disc3,
  Swords,
  ListOrdered,
  Play,
  Compass,
  Bookmark,
  Clock,
  Users,
  ArrowRight,
  Heart,
  Sparkles,
  Star,
} from 'lucide-react';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { Button } from '@/shared/components/ui/Button';
import {
  usePartySection,
  useBattleSection,
  useTierlistSection,
  useTrendingSection,
  useHeroBlock,
} from '../hooks/useHomeV2Data';
import { Carousel, SkeletonRow } from './HomeV2Carousel';
import { PartyCard, BattleCard, TierlistCard, TrendingCard } from './HomeV2Cards';

/* ─── Shared section wrapper (editorial) ─── */
function Section({ title, subtitle, eyebrow, accent, icon: Icon, seeAllHref, seeAllLabel = 'See All', children }) {
  const navigate = useNavigate();
  return (
    <section className="hv2-section">
      <div className="hv2-section-head">
        <div className="hv2-section-heading">
          {eyebrow && <div className="hv2-section-eyebrow">{eyebrow}</div>}
          <h2 className="hv2-section-title">
            {Icon && <Icon size={18} />}
            {accent ? (
              <>
                {title} <em className="hv2-accent">{accent}</em>
              </>
            ) : title}
          </h2>
          {subtitle && <p className="hv2-section-subtitle">{subtitle}</p>}
        </div>
        {seeAllHref && (
          <button className="hv2-see-all" onClick={() => navigate(seeAllHref)}>
            {seeAllLabel} <ArrowRight size={12} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return <div className="hv2-empty">{text}</div>;
}

function ErrorState({ text, retryLabel, onRetry }) {
  return (
    <div className="hv2-empty hv2-empty--error">
      <span>{text}</span>
      {onRetry ? (
        <button type="button" className="hv2-btn hv2-btn--muted" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HERO — clear value proposition + dual CTA + floating preview card
   ═══════════════════════════════════════════════════════════════════════════ */

function getTitleTypeLabel(type, pick) {
  if (type === 'anime') return pick('อนิเมะ', 'Anime');
  if (type === 'manga') return pick('มังงะ', 'Manga');
  if (type === 'manhwa') return pick('มันฮวา', 'Manhwa');
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : pick('เรื่องแนะนำ', 'Title');
}

export function HeroBanner() {
  const { heroBlock } = useHeroBlock();
  const { showAdult } = useAgeGate();
  const { trendingTitles } = useTrendingSection(showAdult);
  const navigate = useNavigate();
  const { language, pick } = useLanguage();

  const subtitle =
    heroBlock?.subtitle ||
    pick(
      'ค้นหาเรื่องจากอารมณ์ เก็บลิสต์ดูต่อแบบฉลาด ดวลรสนิยมกับเพื่อน และจัดอันดับทุกเรื่องที่รักไว้ในที่เดียว',
      'Find titles by mood, keep a smart watchlist, battle taste with friends, and rank everything you love — all in one place.',
    );

  const today = new Date();
  const dateLabel = today.toLocaleDateString(pick('th-TH', 'en-US'), { weekday: 'short', month: 'short', day: 'numeric' });

  // Spotlight: pull from top trending title (real data only — no design fillers).
  const spotlightTitle = trendingTitles?.[0];
  const spotlightCover = spotlightTitle?.cover || spotlightTitle?.cover_image || '';
  const spotlightName = spotlightTitle
    ? ((language === 'th' && spotlightTitle.title_th) ? spotlightTitle.title_th : (spotlightTitle.title_en || spotlightTitle.canonicalTitle || spotlightTitle.canonical_title || ''))
    : '';
  const spotlightTypeLabel = getTitleTypeLabel(spotlightTitle?.type, pick);
  const spotlightYear = spotlightTitle?.year || spotlightTitle?.release_year || null;
  const rawScore = spotlightTitle?.score ?? spotlightTitle?.avg_score ?? null;
  const spotlightScore = (typeof rawScore === 'number' && rawScore > 0)
    ? (rawScore > 10 ? (rawScore / 10).toFixed(1) : rawScore.toFixed(1))
    : null;
  const spotlightHref = spotlightTitle?.slug ? `/title/${spotlightTitle.slug}` : '/discover';
  const showSpotlight = Boolean(spotlightTitle && spotlightCover);

  return (
    <section className={`hv2-hero${showSpotlight ? '' : ' hv2-hero--single'}`}>
      <div className="hv2-hero-bg" aria-hidden="true" />
      <div className="hv2-hero-inner">
        <span className="hv2-hero-badge">
          {pick('เริ่มจากอารมณ์ของคุณ', 'Start with your mood')}
        </span>
        <div className="hv2-hero-eyebrow">{dateLabel.toUpperCase()}</div>
        <h1 className="hv2-hero-title">
          <span>{pick('วันนี้คุณรู้สึก', 'What are you')}</span>
          <span>
            <em className="hv2-gradient-word">{pick('แบบไหน', 'feeling')}</em>
            {pick(' ?', ' tonight?')}
          </span>
        </h1>
        <p className="hv2-hero-subtitle">{subtitle}</p>
        <div className="hv2-hero-actions">
          <Button size="lg" icon={<Compass size={18} />} onClick={() => navigate('/discover')}>
            {pick('ค้นหาตามมู้ด', 'Find my match')}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            iconRight={<ArrowRight size={16} />}
            onClick={() => navigate('/party/templates')}
          >
            {pick('เล่นกับเพื่อน', 'Play with friends')}
          </Button>
        </div>
        <div className="hv2-hero-meta">
          {pick('อนิเมะ · หนัง · ซีรีส์ · K-drama · มังงะ', 'Anime · Movies · Series · K-drama · Manga')}
        </div>
      </div>

      {showSpotlight && (
        <button
          type="button"
          className="hv2-hero-spotlight"
          onClick={() => navigate(spotlightHref)}
          aria-label={pick(`เปิด ${spotlightName}`, `Open ${spotlightName}`)}
        >
          <img className="hv2-hero-spotlight-img" src={spotlightCover} alt={spotlightName} loading="lazy" />
          <span className="hv2-spotlight-tag">
            <span className="hv2-spotlight-tag-dot" />
            {pick('กำลังมาแรง', 'Trending now')}
          </span>
          {spotlightScore && (
            <span className="hv2-spotlight-rating">
              <Star size={11} aria-hidden="true" />
              {spotlightScore}
            </span>
          )}
          <span className="hv2-spotlight-play" aria-hidden="true">
            <Play size={22} />
          </span>
          <div className="hv2-spotlight-title">{spotlightName}</div>
          <div className="hv2-spotlight-meta">
            {[spotlightYear, spotlightTypeLabel].filter(Boolean).join(' · ')}
          </div>
        </button>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOOD CHIPS — quick paths into Discover
   ═══════════════════════════════════════════════════════════════════════════ */

const MOOD_CHIPS = [
  { emoji: '😌', label: 'Chill', labelTh: 'ชิล', slug: 'chill' },
  { emoji: '🔥', label: 'Hype', labelTh: 'มันส์', slug: 'hype' },
  { emoji: '💔', label: 'Heartbreak', labelTh: 'อกหัก', slug: 'heartbreak' },
  { emoji: '🤔', label: 'Mind-bending', labelTh: 'ชวนคิด', slug: 'mind-bending' },
  { emoji: '🌸', label: 'Cozy', labelTh: 'อบอุ่น', slug: 'cozy' },
  { emoji: '⚔️', label: 'Epic', labelTh: 'มหากาพย์', slug: 'epic' },
  { emoji: '😂', label: 'Funny', labelTh: 'ตลก', slug: 'funny' },
  { emoji: '🖤', label: 'Dark', labelTh: 'ดาร์ก', slug: 'dark' },
];

export function MoodQuickChips() {
  const navigate = useNavigate();
  const { language, pick } = useLanguage();
  return (
    <section className="hv2-moods">
      <div className="hv2-moods-head">
        <span className="hv2-moods-label">{pick('ตอนนี้อารมณ์ไหน?', "What's your mood?")}</span>
      </div>
      {MOOD_CHIPS.map((m) => (
        <button
          key={m.label}
          className="hv2-mood-chip"
          onClick={() => navigate(`/discover?mood=${encodeURIComponent(m.slug)}`)}
        >
          <span className="hv2-mood-emoji">{m.emoji}</span>
          <span>{language === 'th' ? m.labelTh : m.label}</span>
        </button>
      ))}
      <button className="hv2-moods-link" onClick={() => navigate('/discover')}>
        {pick('ดูทุกมู้ด', 'All moods')} <ArrowRight size={12} />
      </button>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEATURE PILLARS — "What you can do here"
   ═══════════════════════════════════════════════════════════════════════════ */

export function FeaturePillars() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const pillars = [
    {
      key: 'discover',
      icon: Compass,
      title: pick('ค้นหา', 'Discover'),
      blurb: pick('หาเรื่องที่ตรงกับอารมณ์ของคุณตอนนี้ ไม่ใช่สิ่งที่อัลกอริทึมเดา', "Stories that match exactly how you feel right now — not what an algorithm thinks you watched."),
      cta: pick('สำรวจ', 'Explore'),
      href: '/discover',
      accent: 'indigo',
    },
    {
      key: 'watchlist',
      icon: Bookmark,
      title: pick('ลิสต์ของฉัน', 'Watchlist'),
      blurb: pick('บันทึก ติดตามความคืบหน้า กลับมาดูต่อได้ทุกอุปกรณ์', 'Save, track, and pick up right where you left off — across every device.'),
      cta: pick('เปิดลิสต์', 'Open list'),
      href: '/watchlist',
      accent: 'sky',
    },
    {
      key: 'battle',
      icon: Swords,
      title: pick('แบทเทิล', 'Battle'),
      blurb: pick('ดวลตัวต่อตัว เพื่อนโหวต แบรกเก็ตชี้ขาดแบบเรียลไทม์', 'Pit two titles head-to-head. Friends vote. Your bracket runs in real time.'),
      cta: pick('เปิดสนาม', 'Open arena'),
      href: '/battle',
      accent: 'rose',
    },
    {
      key: 'party',
      icon: Disc3,
      title: pick('ปาร์ตี้', 'Party'),
      blurb: pick('ห้องเกมทายและโหวตที่เล่นกับเพื่อนได้ทันที — Mood G.I., Bracket Royale, Trivia', 'Quiz and vote games with friends in a private room. Mood G.I., Bracket Royale, Trivia.'),
      cta: pick('สร้างห้อง', 'Make a room'),
      href: '/party',
      accent: 'purple',
    },
    {
      key: 'tierlist',
      icon: ListOrdered,
      title: pick('เทียร์ลิสต์', 'Tier list'),
      blurb: pick('จัดอันดับทุกอย่างจาก S ถึง F แชร์ความเห็นแล้วเทียบกับชาวเรา', 'Rank anything from S to F, share your hot takes, see how your tier compares.'),
      cta: pick('สร้างเทียร์', 'Make a tier'),
      href: '/tierlist',
      accent: 'emerald',
    },
  ];
  return (
    <section className="hv2-pillars-section">
      <div className="hv2-section-head">
        <div className="hv2-section-heading">
          <div className="hv2-section-eyebrow">{pick('ทุกสิ่งในที่เดียว', 'All in one place')}</div>
          <h2 className="hv2-section-title">
            {pick('คุณทำอะไร', 'What you can')} <em className="hv2-accent">{pick('ได้บ้างที่นี่', 'do here')}</em>
          </h2>
          <p className="hv2-section-subtitle">{pick('5 วิธีในการค้นหา เล่น และแชร์รสนิยมของคุณ', 'Five ways to explore, play, and share your taste.')}</p>
        </div>
      </div>
      <div className="hv2-pillars-grid">
        {pillars.map(({ key, icon: Icon, title, blurb, cta, href, accent }) => (
          <button
            key={key}
            className={`hv2-pillar hv2-pillar--${accent}`}
            onClick={() => navigate(href)}
          >
            <div className="hv2-pillar-icon">
              <Icon size={22} strokeWidth={2} />
            </div>
            <div className="hv2-pillar-body">
              <div className="hv2-pillar-title">{title}</div>
              <div className="hv2-pillar-blurb">{blurb}</div>
            </div>
            <span className="hv2-pillar-cta">
              {cta} <ArrowRight size={12} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTINUE WATCHING / WATCHLIST — personalized for signed-in users
   ═══════════════════════════════════════════════════════════════════════════ */

export function ContinueWatchingSection() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const {
    watchlist = [],
    watchlistTitles = [],
    isLoading,
    isTitleMetadataLoading,
  } = useWatchlist() || {};

  const visible = (watchlistTitles || []).slice(0, 10);
  const hasWatchlistItems = (watchlist?.length || 0) > 0;
  // Provider flips isTitleMetadataLoading synchronously before scheduling
  // hydration, so these two flags together cover the full in-flight window.
  // When hydration fails they both go back to false and we fall through to
  // the has-items-but-no-titles recovery branch below.
  const isHydrating = isLoading || isTitleMetadataLoading;

  if (!user) {
    return (
      <Section
        title={pick('เริ่มสร้างลิสต์ของคุณ', 'Build your watchlist')}
        subtitle={pick('เข้าสู่ระบบเพื่อบันทึกเรื่อง ติดตามความคืบหน้า และกลับมาดูต่อได้ทุกเมื่อ', 'Sign in to save titles, track progress, and pick up where you left off.')}
        icon={Bookmark}
      >
        <div className="hv2-watchlist-empty">
          <div className="hv2-watchlist-empty-copy">
            <Heart size={28} />
            <h3>{pick('ลิสต์ของคุณ ไปกับคุณทุกที่', 'Your list, always with you')}</h3>
            <p>{pick('ข้ามอุปกรณ์ ข้ามมู้ด และทุกเรื่องที่บันทึกจะอยู่กับบัญชีคุณเสมอ', 'Across devices. Across moods. Anything you save stays with your account.')}</p>
            <div className="hv2-watchlist-empty-actions">
              <button className="hv2-btn hv2-btn--solid" onClick={() => navigate('/login')}>
                {pick('เข้าสู่ระบบเพื่อเริ่ม', 'Sign in to start')}
              </button>
              <button className="hv2-btn hv2-btn--muted" onClick={() => navigate('/discover')}>
                {pick('ลองดูก่อนแบบผู้เยี่ยมชม', 'Browse as guest')}
              </button>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (isHydrating) {
    return (
      <Section
        title={pick('ดูต่อจากที่ค้างไว้', 'Pick up where you left off')}
        icon={Clock}
        seeAllHref="/watchlist"
        seeAllLabel={pick('ดูทั้งหมด', 'See All')}
      >
        <SkeletonRow />
      </Section>
    );
  }

  // Safety net: watchlist has items but title metadata never resolved
  // (network error, RLS miss, etc). Don't show the "empty" copy — surface
  // a recovery CTA to the full watchlist page.
  if (hasWatchlistItems && visible.length === 0) {
    return (
      <Section
        title={pick('ดูต่อจากที่ค้างไว้', 'Pick up where you left off')}
        icon={Clock}
        seeAllHref="/watchlist"
        seeAllLabel={pick('ดูทั้งหมด', 'See All')}
      >
        <div className="hv2-watchlist-empty">
          <div className="hv2-watchlist-empty-copy">
            <Bookmark size={28} />
            <h3>{pick('ลิสต์ของคุณยังโหลดไม่ครบ', "We couldn't load your saved titles")}</h3>
            <p>{pick('ลองเปิดหน้าลิสต์ของคุณโดยตรงเพื่อดูรายการทั้งหมด', 'Open your watchlist directly to see everything you saved.')}</p>
            <div className="hv2-watchlist-empty-actions">
              <button className="hv2-btn hv2-btn--solid" onClick={() => navigate('/watchlist')}>
                {pick('เปิดลิสต์ของคุณ', 'Open your watchlist')}
              </button>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (visible.length === 0) {
    return (
      <Section
        title={pick('ดูต่อจากที่ค้างไว้', 'Pick up where you left off')}
        icon={Clock}
        seeAllHref="/watchlist"
        seeAllLabel={pick('ดูทั้งหมด', 'See All')}
      >
        <div className="hv2-watchlist-empty">
          <div className="hv2-watchlist-empty-copy">
            <Bookmark size={28} />
            <h3>{pick('ลิสต์ของคุณยังว่างอยู่', 'Your watchlist is empty')}</h3>
            <p>{pick('บันทึกเรื่องแรก แล้วเราจะช่วยติดตามความคืบหน้าและหาเรื่องถัดไปให้', "Save your first title and we'll help you track progress and find what's next.")}</p>
            <div className="hv2-watchlist-empty-actions">
              <button className="hv2-btn hv2-btn--solid" onClick={() => navigate('/discover')}>
                {pick('หาเรื่องไว้ดูกัน', 'Find something to watch')}
              </button>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section
      eyebrow={pick('ลิสต์ของคุณ', 'Your list')}
      title={pick('ดูต่อ', 'Pick up')}
      accent={pick('ที่ค้างไว้', 'where you left off')}
      seeAllHref="/watchlist"
      seeAllLabel={pick('ดูทั้งหมด', 'See all')}
    >
      <Carousel>
        {visible.map((t) => (
          <TrendingCard
            key={t.id}
            title={t}
            rank={null}
            onClick={() => navigate(`/title/${t.slug || t.id}`)}
          />
        ))}
      </Carousel>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRENDING
   ═══════════════════════════════════════════════════════════════════════════ */

export function TrendingSection() {
  const { showAdult } = useAgeGate();
  const { trendingTitles, loading, error, retry } = useTrendingSection(showAdult);
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('กำลังมาแรง', 'Trending now')}
      title={pick('ทุกคน', 'Everyone is')}
      accent={pick('กำลังดู', 'watching')}
      seeAllHref="/discover"
      seeAllLabel={pick('ดูทั้งหมด', 'See all')}
    >
      {loading ? (
        <SkeletonRow />
      ) : error ? (
        <ErrorState
          text={pick('โหลดเรื่องฮอตไม่สำเร็จ', "Couldn't load trending titles")}
          retryLabel={pick('ลองอีกครั้ง', 'Try again')}
          onRetry={retry}
        />
      ) : trendingTitles.length === 0 ? (
        <EmptyState text={pick('ตอนนี้ยังไม่มีเรื่องที่กำลังมาแรง', 'Nothing trending right now')} />
      ) : (
        <Carousel>
          {trendingTitles.map((t, i) => (
            <TrendingCard
              key={t.id}
              title={t}
              rank={i + 1}
              onClick={() => navigate(`/title/${t.slug}`)}
            />
          ))}
        </Carousel>
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOW TO START — 3 paths for new users
   ═══════════════════════════════════════════════════════════════════════════ */

export function HowToStartSection() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const paths = [
    {
      key: 'mood',
      title: pick('เลือกมู้ด', 'Pick a mood'),
      desc: pick('แตะชิป หรือบอกว่าตอนนี้รู้สึกยังไง เราจะกรองทั้งคลังตามอารมณ์ ไม่ใช่แนว', "Tap a chip or describe how you feel. We'll filter the entire library by vibe, not genre."),
      icon: Sparkles,
      href: '/discover',
      variant: 'indigo',
    },
    {
      key: 'save',
      title: pick('บันทึกสิ่งที่เจอ', 'Save your finds'),
      desc: pick('แตะ bookmark เพื่อเพิ่มลงลิสต์ ความคืบหน้าจะถูกติดตามอัตโนมัติ', 'Tap the bookmark to add to your watchlist. Track progress automatically as you go.'),
      icon: Bookmark,
      href: '/watchlist',
      variant: 'purple',
    },
    {
      key: 'battle',
      title: pick('ดวลกับเพื่อน', 'Battle a friend'),
      desc: pick('ส่งคำท้าดวลรสนิยม 1v1 เพื่อนโหวต คุณโหวต แบรกเก็ตชี้ขาด', 'Send a 1v1 taste battle. They vote, you vote, the bracket settles it.'),
      icon: Swords,
      href: '/battle/browse',
      variant: 'rose',
    },
    {
      key: 'rank',
      title: pick('จัดอันดับ', 'Rank it'),
      desc: pick('ลากเรื่องไปใส่เทียร์ S–F เผยแพร่ลิสต์ แล้วดูว่าใครรสนิยมตรงกับคุณ', 'Drag titles into S–F tiers. Publish your list and see whose taste actually matches yours.'),
      icon: ListOrdered,
      href: '/tierlist',
      variant: 'amber',
    },
  ];
  return (
    <section className="hv2-howto-section">
      <div className="hv2-section-head">
        <div className="hv2-section-heading">
          <div className="hv2-section-eyebrow">{pick('เพิ่งเข้ามา?', 'New here?')}</div>
          <h2 className="hv2-section-title">
            {pick('วิธี', 'How to')} <em className="hv2-accent">{pick('เริ่ม', 'start')}</em>
          </h2>
          <p className="hv2-section-subtitle">{pick('4 ขั้นตอน ใช้เวลาประมาณ 90 วินาที', 'Four steps · about ninety seconds.')}</p>
        </div>
      </div>
      <div className="hv2-howto-grid">
        {paths.map(({ key, title, desc, icon: Icon, href, variant }) => (
          <button
            key={key}
            className={`hv2-howto-card hv2-howto-card--${variant}`}
            onClick={() => navigate(href)}
          >
            <div className="hv2-howto-icon">
              <Icon size={18} strokeWidth={2.2} />
            </div>
            <div className="hv2-howto-title">{title}</div>
            <div className="hv2-howto-desc">{desc}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTY / BATTLE / TIERLIST (existing carousels, enhanced headers)
   ═══════════════════════════════════════════════════════════════════════════ */

export function PartySection() {
  // Party templates aren't age-gated server-side, so we don't pass showAdult —
  // avoids a pointless refetch (and its creator/cover fan-out) on toggle.
  const { partyTemplates, loading, error, retry } = usePartySection();
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('เล่นกับเพื่อน', 'Play together')}
      title={pick('ปาร์ตี้', 'Party')}
      accent={pick('เริ่มเลย', 'right now')}
      seeAllHref="/party/templates"
      seeAllLabel={pick('ดูทั้งหมด', 'See all')}
    >
      {loading ? (
        <SkeletonRow />
      ) : error ? (
        <ErrorState
          text={pick('โหลดเทมเพลตปาร์ตี้ไม่สำเร็จ', "Couldn't load party templates")}
          retryLabel={pick('ลองอีกครั้ง', 'Try again')}
          onRetry={retry}
        />
      ) : partyTemplates.length === 0 ? (
        <EmptyState text={pick('ยังไม่มีเทมเพลตให้เล่นตอนนี้', 'No templates available')} />
      ) : (
        <Carousel>
          {partyTemplates.map((t) => (
            <PartyCard key={t.id} template={t} onClick={() => navigate(`/party/templates/${t.id}`)} />
          ))}
        </Carousel>
      )}
    </Section>
  );
}

export function BattleSection() {
  const { battleDecks, loading, error, retry } = useBattleSection();
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('ตัวต่อตัว', 'Head-to-head')}
      title={pick('สนาม', 'Battle')}
      accent={pick('แบทเทิล', 'arena')}
      seeAllHref="/battle/browse"
      seeAllLabel={pick('ดูทั้งหมด', 'See all')}
    >
      {loading ? (
        <SkeletonRow />
      ) : error ? (
        <ErrorState
          text={pick('โหลดแบทเทิลเด็คไม่สำเร็จ', "Couldn't load battle decks")}
          retryLabel={pick('ลองอีกครั้ง', 'Try again')}
          onRetry={retry}
        />
      ) : battleDecks.length === 0 ? (
        <EmptyState text={pick('ยังไม่มีแบทเทิลให้เล่นตอนนี้', 'No battles available')} />
      ) : (
        <Carousel>
          {battleDecks.map((deck) => (
            <BattleCard key={deck.id} deck={deck} onClick={() => navigate(`/battle/deck/${deck.id}`)} />
          ))}
        </Carousel>
      )}
    </Section>
  );
}

export function TierlistSection() {
  const { showAdult } = useAgeGate();
  const { tierlistTemplates, loading, error, retry } = useTierlistSection(showAdult);
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('จัดอันดับจากชาวเรา', 'From the community')}
      title={pick('เทียร์ลิสต์', 'Tier lists')}
      accent={pick('ที่กำลังฮอต', 'going viral')}
      seeAllHref="/tierlist"
      seeAllLabel={pick('ดูทั้งหมด', 'See all')}
    >
      {loading ? (
        <SkeletonRow />
      ) : error ? (
        <ErrorState
          text={pick('โหลดเทียร์ลิสต์ไม่สำเร็จ', "Couldn't load tier lists")}
          retryLabel={pick('ลองอีกครั้ง', 'Try again')}
          onRetry={retry}
        />
      ) : tierlistTemplates.length === 0 ? (
        <EmptyState text={pick('ยังไม่มีเทียร์ลิสต์ให้ดูตอนนี้', 'No tier lists available')} />
      ) : (
        <Carousel>
          {tierlistTemplates.map((t) => (
            <TierlistCard key={t.id} template={t} onClick={() => navigate(`/tierlist/template/${t.id}`)} />
          ))}
        </Carousel>
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMUNITY CTA — bottom-of-page closer
   ═══════════════════════════════════════════════════════════════════════════ */

const COMMUNITY_AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=240&q=70',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&q=70',
  'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=240&q=70',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&q=70',
  null, // center sparkles tile
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=240&q=70',
  'https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?w=240&q=70',
  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=240&q=70',
  'https://images.unsplash.com/photo-1463453091185-61582044d556?w=240&q=70',
];

export function CommunityCta() {
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <section className="hv2-community">
      <div className="hv2-community-content">
        <div className="hv2-community-eyebrow">{pick('จากชาวเรา', 'From the community')}</div>
        <h2 className="hv2-community-title">
          {pick('เทียร์ลิสต์ ปาร์ตี้ แบทเทิล', 'Tier lists, parties & battles')}{' '}
          <em>{pick('ที่ทุกคนสร้าง', 'made by everyone')}</em>
        </h2>
        <p className="hv2-community-sub">
          {pick(
            'เข้าห้องปาร์ตี้ที่กำลังเล่นอยู่ตอนนี้ ดูอันดับบนกระดาน Battle หรือเล่นเทียร์ลิสต์ฮิตประจำสัปดาห์',
            'Drop into a live party room, climb the Battle leaderboard, or play this week\'s hot tier list.',
          )}
        </p>
        <div className="hv2-community-actions">
          <button className="hv2-btn hv2-btn--primary" onClick={() => navigate('/party/rooms')}>
            <Users size={15} /> {pick('ดูห้องที่กำลังเล่น', 'Join a live room')}
          </button>
          <button className="hv2-btn hv2-btn--secondary" onClick={() => navigate('/battle/leaderboard')}>
            {pick('เปิด Leaderboard', 'Open leaderboard')} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="hv2-community-stack" aria-hidden="true">
        {COMMUNITY_AVATARS.map((src, i) => (
          src ? (
            <div key={i} className="hv2-community-stack-cell">
              <img src={src} alt="" loading="lazy" />
            </div>
          ) : (
            <div key={i} className="hv2-community-stack-cell hv2-community-stack-center">
              <Sparkles size={26} strokeWidth={2.4} />
            </div>
          )
        ))}
      </div>
    </section>
  );
}
