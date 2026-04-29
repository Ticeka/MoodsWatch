import React from 'react';
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
