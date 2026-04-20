import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  TrendingUp,
  Disc3,
  Swords,
  ListOrdered,
  Play,
  Compass,
  Bookmark,
  Clock,
  Users,
  Flame,
  ArrowRight,
  Heart,
  Film,
} from 'lucide-react';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
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
            {seeAllLabel} <ChevronRight size={14} />
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

/* ═══════════════════════════════════════════════════════════════════════════
   HERO — clear value proposition + dual CTA + floating preview card
   ═══════════════════════════════════════════════════════════════════════════ */

export function HeroBanner() {
  const { heroBlock } = useHeroBlock();
  const navigate = useNavigate();
  const { pick } = useLanguage();

  const title = heroBlock?.title || pick('หาดูเรื่องที่ใช่ เล่นกับเพื่อน แล้วจัดอันดับทุกความชอบ', 'Find what to watch. Play with friends. Rank everything.');
  const subtitle =
    heroBlock?.subtitle ||
    pick(
      'ค้นหาเรื่องจากอารมณ์ เก็บลิสต์ดูต่อแบบฉลาด ดวลรสนิยมกับเพื่อน และจัดอันดับทุกเรื่องที่รักได้ในที่เดียว',
      'Discover titles by mood, keep a smart watchlist, battle taste with friends, and rank everything you love - all in one place.',
    );

  const today = new Date();
  const dateLabel = today.toLocaleDateString(pick('th-TH', 'en-US'), { weekday: 'short', month: 'short', day: 'numeric' });
  const feelingWord = pick('รู้สึก', 'feeling');

  return (
    <section className="hv2-hero">
      <div className="hv2-hero-inner">
        <div className="hv2-hero-eyebrow">{dateLabel}</div>
        <h1 className="hv2-hero-title">
          {pick('วันนี้คุณ', 'What are you')} <em className="hv2-gradient-word">{feelingWord}</em> {pick('ยังไง?', 'today?')}
        </h1>
        <p className="hv2-hero-subtitle">{subtitle}</p>
        <div className="hv2-hero-actions">
          <button className="hv2-btn hv2-btn--gradient" onClick={() => navigate('/discover')}>
            <Compass size={16} /> {pick('ค้นหาตามมู้ด', 'Find my match')}
          </button>
          <button className="hv2-btn hv2-btn--ghost" onClick={() => navigate('/party/templates')}>
            {pick('เล่นกับเพื่อน', 'Play with friends')} <ChevronRight size={14} />
          </button>
        </div>
        <div className="hv2-hero-meta">
          <Film size={13} /> {pick('อนิเมะ · หนัง · ซีรีส์ · K-drama · มังงะ', 'Anime · Movies · Series · K-drama · Manga')}
        </div>
      </div>
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
        <button className="hv2-moods-link" onClick={() => navigate('/discover')}>
          {pick('ดูทุกมู้ด', 'All moods')} <ChevronRight size={14} />
        </button>
      </div>
      <div className="hv2-moods-row">
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
      </div>
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
      blurb: pick('หาเรื่องที่ตรงกับอารมณ์ของคุณตอนนี้', 'Find stories that match how you feel right now.'),
      href: '/discover',
      accent: 'indigo',
    },
    {
      key: 'watchlist',
      icon: Bookmark,
      title: pick('ลิสต์ของฉัน', 'Watchlist'),
      blurb: pick('บันทึก ติดตามความคืบหน้า แล้วกลับมาดูต่อได้ทันที', 'Save, track progress, pick up right where you left off.'),
      href: '/watchlist',
      accent: 'sky',
    },
    {
      key: 'battle',
      icon: Swords,
      title: pick('แบทเทิล', 'Battle'),
      blurb: pick('เปิดโหวตดวลกับเพื่อน แล้วดูว่าเรื่องไหนชนะสายคุณ', 'Vote showdowns with friends. Who wins your bracket?'),
      href: '/battle',
      accent: 'rose',
    },
    {
      key: 'party',
      icon: Disc3,
      title: pick('ปาร์ตี้', 'Party'),
      blurb: pick('ห้องเกมทายและโหวตที่เล่นกับเพื่อนได้ทันที', 'Quiz and vote games you can run in a room with friends.'),
      href: '/party',
      accent: 'purple',
    },
    {
      key: 'tierlist',
      icon: ListOrdered,
      title: pick('เทียร์ลิสต์', 'Tierlist'),
      blurb: pick('จัดอันดับทุกอย่างตั้งแต่ S ถึง F แล้วแชร์ความเห็นของคุณ', 'Rank anything from S to F. Share your hot takes.'),
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
        {pillars.map(({ key, icon: Icon, title, blurb, href, accent }) => (
          <button
            key={key}
            className={`hv2-pillar hv2-pillar--${accent}`}
            onClick={() => navigate(href)}
          >
            <div className="hv2-pillar-icon">
              <Icon size={22} strokeWidth={2.2} />
            </div>
            <div className="hv2-pillar-body">
              <div className="hv2-pillar-title">{title}</div>
              <div className="hv2-pillar-blurb">{blurb}</div>
            </div>
            <ArrowRight size={16} className="hv2-pillar-arrow" />
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
  const { watchlistTitles = [], isLoading } = useWatchlist() || {};

  const visible = (watchlistTitles || []).slice(0, 10);

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

  if (isLoading) {
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
      seeAllLabel={pick('ดูทั้งหมด', 'See all →')}
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
  const { trendingTitles, loading } = useTrendingSection(showAdult);
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('กำลังมาแรง', 'Trending now')}
      title={pick('ทุกคน', 'Everyone is')}
      accent={pick('กำลังดู', 'watching')}
      seeAllHref="/discover"
      seeAllLabel={pick('ดูทั้งหมด', 'See all →')}
    >
      {loading ? (
        <SkeletonRow />
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
      tag: pick('ยังไม่รู้จะดูอะไรดี?', 'Not sure what to watch?'),
      title: pick('ค้นหาตามมู้ด', 'Find by mood'),
      desc: pick('บอกอารมณ์ตอนนี้ แล้วรับเรื่องที่เข้ากัน', 'Tell us how you feel and get a pick that fits.'),
      cta: pick('เปิด Discover', 'Open Discover'),
      icon: Compass,
      href: '/discover',
      variant: 'indigo',
    },
    {
      key: 'party',
      tag: pick('มีเวลา 10 นาทีกับเพื่อน?', 'Got 10 minutes with friends?'),
      title: pick('เริ่มปาร์ตี้', 'Start a party'),
      desc: pick('เลือกเทมเพลตเกมทายหรือโหวต แล้วแชร์ลิงก์ห้องได้เลย', 'Pick a quiz or vote template and share the room link.'),
      cta: pick('ดูเทมเพลต', 'Browse templates'),
      icon: Disc3,
      href: '/party/templates',
      variant: 'purple',
    },
    {
      key: 'battle',
      tag: pick('อยากเถียงเรื่องรสนิยม?', 'Want to argue taste?'),
      title: pick('เปิดแบทเทิล', 'Spin up a battle'),
      desc: pick('ตั้งโหมดดวลแบบตัวต่อตัวกับทุกเรื่องที่คุณชอบ', 'Run a head-to-head bracket on anything you love.'),
      cta: pick('ดูแบทเทิล', 'Browse battles'),
      icon: Swords,
      href: '/battle/browse',
      variant: 'rose',
    },
  ];
  return (
    <section className="hv2-howto-section">
      <div className="hv2-section-head">
        <div className="hv2-section-heading">
          <div className="hv2-section-eyebrow">{pick('เพิ่งเข้ามา?', 'New here?')}</div>
          <h2 className="hv2-section-title">
            {pick('เริ่มจาก', 'Start from')} <em className="hv2-accent">{pick('ทางลัดพวกนี้', 'one of these')}</em>
          </h2>
          <p className="hv2-section-subtitle">{pick('3 วิธีสั้น ๆ ให้คุ้นกับ MoodsWatch ภายในไม่ถึงนาที', 'Three quick ways to get the hang of MoodsWatch in under a minute.')}</p>
        </div>
      </div>
      <div className="hv2-howto-grid">
        {paths.map(({ key, tag, title, desc, cta, icon: Icon, href, variant }) => (
          <button
            key={key}
            className={`hv2-howto-card hv2-howto-card--${variant}`}
            onClick={() => navigate(href)}
          >
            <div className="hv2-howto-icon">
              <Icon size={22} />
            </div>
            <div className="hv2-howto-tag">{tag}</div>
            <div className="hv2-howto-title">{title}</div>
            <div className="hv2-howto-desc">{desc}</div>
            <div className="hv2-howto-cta">
              {cta} <ArrowRight size={14} />
            </div>
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
  const { showAdult } = useAgeGate();
  const { partyTemplates, loading } = usePartySection(showAdult);
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('เล่นกับเพื่อน', 'Play together')}
      title={pick('ปาร์ตี้', 'Party')}
      accent={pick('เริ่มเลย', 'right now')}
      seeAllHref="/party/templates"
      seeAllLabel={pick('ดูทั้งหมด', 'See all →')}
    >
      {loading ? (
        <SkeletonRow />
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
  const { battleDecks, loading } = useBattleSection();
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('ตัวต่อตัว', 'Head-to-head')}
      title={pick('สนาม', 'Battle')}
      accent={pick('แบทเทิล', 'arena')}
      seeAllHref="/battle/browse"
      seeAllLabel={pick('ดูทั้งหมด', 'See all →')}
    >
      {loading ? (
        <SkeletonRow />
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
  const { tierlistTemplates, loading } = useTierlistSection(showAdult);
  const navigate = useNavigate();
  const { pick } = useLanguage();

  return (
    <Section
      eyebrow={pick('จัดอันดับจากชาวเรา', 'From the community')}
      title={pick('เทียร์ลิสต์', 'Tier lists')}
      accent={pick('ที่กำลังฮอต', 'going viral')}
      seeAllHref="/tierlist"
      seeAllLabel={pick('ดูทั้งหมด', 'See all →')}
    >
      {loading ? (
        <SkeletonRow />
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

export function CommunityCta() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pick } = useLanguage();

  return (
    <section className="hv2-community">
      <div className="hv2-community-bg" aria-hidden="true" />
      <div className="hv2-community-content">
        <div className="hv2-community-icon">
          <Users size={22} />
        </div>
        <h2 className="hv2-community-title">
          {user ? pick('ชวนเพื่อนเข้ามาสนุกด้วยกัน', 'Bring your friends in') : pick('เข้าร่วมคอมมูนิตี้', 'Join the community')}
        </h2>
        <p className="hv2-community-sub">
          {user
            ? pick('แชร์ห้องปาร์ตี้ ชวนเพื่อนมาแบทเทิล หรืออวดเทียร์ลิสต์ของคุณได้เลย', 'Share a party room, challenge a friend to a battle, or show off your tier list.')
            : pick('เข้าสู่ระบบเพื่อบันทึกลิสต์ เปิดห้องปาร์ตี้ และไต่แรงก์บนกระดานแบทเทิล', 'Sign in to save your watchlist, host parties, and climb the battle leaderboard.')}
        </p>
        <div className="hv2-community-actions">
          {!user && (
            <button className="hv2-btn hv2-btn--primary" onClick={() => navigate('/login')}>
              <Flame size={16} /> {pick('สร้างบัญชีฟรี', 'Create a free account')}
            </button>
          )}
          <button className="hv2-btn hv2-btn--ghost" onClick={() => navigate('/party/templates')}>
            <Play size={16} /> {pick('เปิดปาร์ตี้', 'Host a party')}
          </button>
        </div>
      </div>
    </section>
  );
}
