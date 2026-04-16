import React, { useState } from 'react';
import { Compass, Disc3, Swords, ListOrdered } from 'lucide-react';
import { HeroBanner, TrendingSection, PartySection, BattleSection, TierlistSection } from '../components/HomeV2Sections';
import '../styles/HomeV2Mockup.css';

const TABS = [
  { key: 'all',      label: 'Discover', Icon: Compass },
  { key: 'party',    label: 'Party',    Icon: Disc3 },
  { key: 'battle',   label: 'Battle',   Icon: Swords },
  { key: 'tierlist', label: 'Tierlist',  Icon: ListOrdered },
];

const SUBCATEGORIES = {
  party:    ['All', 'Quiz', 'Vote', 'Popular'],
  battle:   ['All', 'Anime', 'Characters', 'Trending'],
  tierlist: ['All', 'Anime', 'Songs', 'Community'],
};

export function HomeV2Mockup() {
  const [tab, setTab] = useState('all');
  const [sub, setSub] = useState('All');

  const handleTab = (key) => { setTab(key); setSub('All'); };
  const subs = SUBCATEGORIES[tab] || null;

  const showAll    = tab === 'all';
  const showParty  = showAll || tab === 'party';
  const showBattle = showAll || tab === 'battle';
  const showTier   = showAll || tab === 'tierlist';

  return (
    <div className="hv2-root">
      <main className="hv2-container">

        {/* ── Tabs ── */}
        <header className="hv2-header">
          <nav className="hv2-tabs">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`hv2-tab${tab === key ? ' hv2-tab--active' : ''}`}
                onClick={() => handleTab(key)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          {subs && (
            <div className="hv2-subcategories">
              {subs.map(s => (
                <button
                  key={s}
                  className={`hv2-pill${sub === s ? ' hv2-pill--active' : ''}`}
                  onClick={() => setSub(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Content ── */}
        {showAll    && <HeroBanner />}
        {showAll    && <TrendingSection />}
        {showParty  && <PartySection />}
        {showBattle && <BattleSection />}
        {showTier   && <TierlistSection />}

      </main>
    </div>
  );
}

export default HomeV2Mockup;
