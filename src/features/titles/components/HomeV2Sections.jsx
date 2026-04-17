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
  Sparkles,
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

/* ─── Shared section wrapper ─── */
function Section({ title, subtitle, icon: Icon, seeAllHref, seeAllLabel = 'See All', children }) {
  const navigate = useNavigate();
  return (
    <section className="hv2-section">
      <div className="hv2-section-head">
        <div className="hv2-section-heading">
          <h2 className="hv2-section-title">
            {Icon && <Icon size={20} />}
            {title}
          </h2>
          {subtitle && <p className="hv2-section-subtitle">{subtitle}</p>}
        </div>
        {seeAllHref && (
          <button className="hv2-see-all" onClick={() => navigate(seeAllHref)}>
            {seeAllLabel} <ChevronRight size={16} />
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

  return (
    <section className="hv2-hero">
      <div className="hv2-hero-bg" aria-hidden="true">
        <div className="hv2-hero-orb hv2-hero-orb--1" />
        <div className="hv2-hero-orb hv2-hero-orb--2" />
        <div className="hv2-hero-orb hv2-hero-orb--3" />
        <div className="hv2-hero-grid" />
      </div>

      <div className="hv2-hero-inner">
        <div className="hv2-hero-content">
          <div className="hv2-hero-badge">
            <Sparkles size={14} /> {pick('พื้นที่เล่นของรสนิยมคุณ', 'Your taste, your playground')}
          </div>
          <h1 className="hv2-hero-title">{title}</h1>
          <p className="hv2-hero-subtitle">{subtitle}</p>
          <div className="hv2-hero-actions">
            <button
              className="hv2-btn hv2-btn--primary"
              onClick={() => navigate('/discover')}
            >
              <Compass size={16} /> {pick('ค้นหาตามมู้ด', 'Find by mood')}
            </button>
            <button
              className="hv2-btn hv2-btn--ghost"
              onClick={() => navigate('/party/templates')}
            >
              <Play size={16} /> {pick('เล่นกับเพื่อน', 'Play with friends')}
            </button>
          </div>
          <div className="hv2-hero-meta">
            <span><Film size={13} /> {pick('อนิเมะ · หนัง · ซีรีส์ · K-drama · มังงะ', 'Anime · Movies · Series · K-drama · Manga')}</span>
          </div>
        </div>

        <div className="hv2-hero-visual" aria-hidden="true">
          <div className="hv2-hero-card hv2-hero-card--1">
            <div className="hv2-hero-card-dot" style={{ background: '#a855f7' }} />
            <div>
              <div className="hv2-hero-card-title">{pick('ห้องปาร์ตี้', 'Party room')}</div>
              <div className="hv2-hero-card-sub">{pick('เพื่อน 4 คนกำลังโหวต', '4 friends voting')}</div>
            </div>
          </div>
          <div className="hv2-hero-card hv2-hero-card--2">
            <div className="hv2-hero-card-dot" style={{ background: '#ef4444' }} />
            <div>
              <div className="hv2-hero-card-title">{pick('แบทเทิล', 'Battle')}</div>
              <div className="hv2-hero-card-sub">{pick('S-tier ปะทะ A-tier', 'S-tier vs A-tier')}</div>
            </div>
          </div>
          <div className="hv2-hero-card hv2-hero-card--3">
            <div className="hv2-hero-card-dot" style={{ background: '#22c55e' }} />
            <div>
              <div className="hv2-hero-card-title">{pick('เทียร์ลิสต์', 'Tier list')}</div>
              <div className="hv2-hero-card-sub">{pick('จัดอันดับครบ Top 100', 'Top 100 ranked')}</div>
            </div>
          </div>
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
          <h2 className="hv2-section-title">{pick('คุณทำอะไรได้บ้างที่นี่', 'What you can do here')}</h2>
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
      title={pick('ดูต่อจากที่ค้างไว้', 'Pick up where you left off')}
      subtitle={pick('ลิสต์ของคุณ พร้อมเสมอเมื่อคุณกลับมา', 'Your watchlist, ready when you are.')}
      icon={Clock}
      seeAllHref="/watchlist"
      seeAllLabel={pick('ดูทั้งหมด', 'See All')}
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
      title={pick('กำลังมาแรงตอนนี้', 'Trending Now')}
      subtitle={pick('เรื่องที่คอมมูนิตี้กำลังดูในสัปดาห์นี้', 'What the community is watching this week.')}
      icon={TrendingUp}
      seeAllHref="/discover"
      seeAllLabel={pick('ดูทั้งหมด', 'See All')}
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
          <h2 className="hv2-section-title">
            <Sparkles size={20} /> {pick('เพิ่งเข้ามา? เริ่มจากทางลัดพวกนี้ได้เลย', 'New here? Start from one of these')}
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
      title={pick('เกมปาร์ตี้', 'Party Games')}
      subtitle={pick('เทมเพลตเกมทายและโหวตที่พร้อมเล่นในห้องทันที', 'Quiz and vote templates ready to play in a room.')}
      icon={Disc3}
      seeAllHref="/party/templates"
      seeAllLabel={pick('ดูทั้งหมด', 'See All')}
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
      title={pick('สนามแบทเทิล', 'Battle Arena')}
      subtitle={pick('โหวตแบบตัวต่อตัว เลือกฝั่งแล้วโชว์เหตุผลของคุณ', 'Head-to-head votes. Pick a side and make your case.')}
      icon={Swords}
      seeAllHref="/battle/browse"
      seeAllLabel={pick('ดูทั้งหมด', 'See All')}
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
      title={pick('เทียร์ลิสต์จากคอมมูนิตี้', 'Community Tier Lists')}
      subtitle={pick('อันดับที่คอมมูนิตี้กำลังช่วยกันจัดอยู่ตอนนี้', 'Rankings the community is building right now.')}
      icon={ListOrdered}
      seeAllHref="/tierlist"
      seeAllLabel={pick('ดูทั้งหมด', 'See All')}
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
