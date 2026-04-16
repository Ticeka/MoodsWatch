import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, TrendingUp, Disc3, Swords, ListOrdered, Zap, Play } from 'lucide-react';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { usePartySection, useBattleSection, useTierlistSection, useTrendingSection, useHeroBlock } from '../hooks/useHomeV2Data';
import { Carousel, SkeletonRow } from './HomeV2Carousel';
import { PartyCard, BattleCard, TierlistCard, TrendingCard } from './HomeV2Cards';

/* ─── Shared section wrapper ─── */
function Section({ title, icon: Icon, seeAllHref, children }) {
  const navigate = useNavigate();
  return (
    <section className="hv2-section">
      <div className="hv2-section-head">
        <h2 className="hv2-section-title">
          {Icon && <Icon size={20} />}
          {title}
        </h2>
        {seeAllHref && (
          <button className="hv2-see-all" onClick={() => navigate(seeAllHref)}>
            See All <ChevronRight size={16} />
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
   Each section fetches its own data independently → progressive rendering
   ═══════════════════════════════════════════════════════════════════════════ */

export function HeroBanner() {
  const { heroBlock } = useHeroBlock();
  const navigate = useNavigate();

  return (
    <section className="hv2-hero">
      <div className="hv2-hero-bg" />
      <div className="hv2-hero-content">
        <div className="hv2-hero-badge"><Zap size={14} /> New</div>
        <h1>{heroBlock?.title || 'Discover, Play & Rank'}</h1>
        <p>{heroBlock?.subtitle || 'Join party games, challenge friends in battles, and create your own tier lists.'}</p>
        <div className="hv2-hero-actions">
          <button className="hv2-btn hv2-btn--primary" onClick={() => navigate('/party/templates')}>
            <Play size={16} /> Browse Templates
          </button>
          <button className="hv2-btn hv2-btn--ghost" onClick={() => navigate('/battle')}>
            <Swords size={16} /> Start Battle
          </button>
        </div>
      </div>
    </section>
  );
}

export function TrendingSection() {
  const { showAdult } = useAgeGate();
  const { trendingTitles, loading } = useTrendingSection(showAdult);
  const navigate = useNavigate();

  return (
    <Section title="Trending Now" icon={TrendingUp} seeAllHref="/discover">
      {loading ? <SkeletonRow /> : trendingTitles.length === 0 ? <EmptyState text="Nothing trending right now" /> : (
        <Carousel>
          {trendingTitles.map((t, i) => (
            <TrendingCard key={t.id} title={t} rank={i + 1} onClick={() => navigate(`/title/${t.slug}`)} />
          ))}
        </Carousel>
      )}
    </Section>
  );
}

export function PartySection() {
  const { showAdult } = useAgeGate();
  const { partyTemplates, loading } = usePartySection(showAdult);
  const navigate = useNavigate();

  return (
    <Section title="Party Games" icon={Disc3} seeAllHref="/party/templates">
      {loading ? <SkeletonRow /> : partyTemplates.length === 0 ? <EmptyState text="No templates available" /> : (
        <Carousel>
          {partyTemplates.map(t => (
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

  return (
    <Section title="Battle Arena" icon={Swords} seeAllHref="/battle/browse">
      {loading ? <SkeletonRow /> : battleDecks.length === 0 ? <EmptyState text="No battles available" /> : (
        <Carousel>
          {battleDecks.map(deck => (
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

  return (
    <Section title="Community Tierlists" icon={ListOrdered} seeAllHref="/tierlist">
      {loading ? <SkeletonRow /> : tierlistTemplates.length === 0 ? <EmptyState text="No tier lists available" /> : (
        <Carousel>
          {tierlistTemplates.map(t => (
            <TierlistCard key={t.id} template={t} onClick={() => navigate(`/tierlist/template/${t.id}`)} />
          ))}
        </Carousel>
      )}
    </Section>
  );
}
