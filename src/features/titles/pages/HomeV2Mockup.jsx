import React, { useEffect } from 'react';
import {
  HeroBanner,
  MoodQuickChips,
  FeaturePillars,
  ContinueWatchingSection,
  TrendingSection,
  HowToStartSection,
  PartySection,
  BattleSection,
  TierlistSection,
  CommunityCta,
} from '../components/HomeV2Sections';
import '../styles/HomeV2Mockup.css';

export function HomeV2Mockup() {
  useEffect(() => {
    const id = 'hv2-fraunces-font';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400..900;1,400..900&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div className="hv2-root">
      <main className="hv2-container">
        <HeroBanner />
        <MoodQuickChips />
        <FeaturePillars />
        <ContinueWatchingSection />
        <TrendingSection />
        <HowToStartSection />
        <PartySection />
        <BattleSection />
        <TierlistSection />
        <CommunityCta />
      </main>
    </div>
  );
}

export default HomeV2Mockup;
