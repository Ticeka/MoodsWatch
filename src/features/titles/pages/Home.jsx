import React from 'react';
import { useFavoriteTitles } from '@/features/profile/hooks/useFavoriteTitles';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { HomeContinueSection } from '@/features/titles/components/HomeContinueSection';
import { HomeEditorialSections } from '@/features/titles/components/HomeEditorialSections';
import { HomeFinderSection } from '@/features/titles/components/HomeFinderSection';
import { HomeHeroSection } from '@/features/titles/components/HomeHeroSection';
import { HomeRandomPickModal } from '@/features/titles/components/HomeRandomPickModal';
import { HomeResultsSection } from '@/features/titles/components/HomeResultsSection';
import { HomeTrendingSection } from '@/features/titles/components/HomeTrendingSection';
import { useHomeContinueWatching } from '@/features/titles/hooks/useHomeContinueWatching';
import { useHomeDiscovery } from '@/features/titles/hooks/useHomeDiscovery';
import './Home.css';

export function Home() {
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const { watchlist, advanceProgress, updateItem, setConsumptionTarget, catchUpToTarget } = useWatchlist();
  const { favoriteTitleIds } = useFavoriteTitles();
  const { hiddenFromRecommendationIds, hiddenFromDiscoveryIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const discovery = useHomeDiscovery({
    watchlist,
    favoriteTitleIds,
    hiddenFromRecommendationIds,
    hiddenFromDiscoveryIds,
    prefs,
    showAdult,
    t,
  });
  const continueWatching = useHomeContinueWatching({
    watchlist,
    hiddenFromDiscoveryIds,
    showAdult,
    advanceProgress,
    updateItem,
    setConsumptionTarget,
    catchUpToTarget,
    t,
  });

  const quickMoods = discovery.visibleMoods.slice(0, 6);
  const heroTitle = discovery.heroBlock?.title || t('home.heroTitle');
  const heroSubtitle = discovery.heroBlock?.subtitle || t('home.heroSubtitle');
  const heroAccent = discovery.heroBlock?.config?.accentText || t('home.heroAccent');
  const heroLead = heroTitle.includes(heroAccent) ? heroTitle.replace(heroAccent, '') : heroTitle;
  const heroCtaLabel = discovery.heroBlock?.config?.ctaLabel || t('home.startFinding');
  const heroCtaHref = discovery.heroBlock?.config?.ctaHref || null;
  const showContinueSection = (discovery.hasContinueBlock || !discovery.hasEditorialBlocks)
    && continueWatching.continueCards.length > 0
    && !discovery.results.length
    && !discovery.isLoading;
  const showTrendingSection = (discovery.hasTrendingBlock || !discovery.hasEditorialBlocks)
    && !discovery.results.length
    && !discovery.isLoading;

  return (
    <div className="home-page animate-fade-in">
      <HomeRandomPickModal
        isOpen={discovery.isRandomModalOpen}
        isLoading={discovery.isRandomLoading}
        randomPick={discovery.randomPick}
        onClose={discovery.closeRandomModal}
        onPickAgain={discovery.handleRandomPick}
        t={t}
      />
      <HomeHeroSection
        heroBlock={discovery.heroBlock}
        heroLead={heroLead}
        heroTitle={heroTitle}
        heroAccent={heroAccent}
        heroSubtitle={heroSubtitle}
        heroCtaLabel={heroCtaLabel}
        heroCtaHref={heroCtaHref}
        quickMoods={quickMoods}
        moods={discovery.moods}
        language={language}
        onQuickMood={discovery.handleQuickMood}
        onRandomPick={discovery.handleRandomPick}
        t={t}
      />
      <HomeFinderSection
        language={language}
        t={t}
        hideSeen={discovery.hideSeen}
        onHideSeenChange={discovery.setHideSeen}
        shouldShowTypeSelector={discovery.shouldShowTypeSelector}
        type={discovery.type}
        onTypeChange={discovery.handleTypeChange}
        moods={discovery.moods}
        onMoodsChange={discovery.handleMoodsChange}
        timeOption={discovery.timeOption}
        onTimeOptionChange={discovery.handleTimeOptionChange}
        onRecommend={discovery.handleRecommend}
        isLoading={discovery.isLoading}
        hasActiveFilters={discovery.hasFinderActiveFilters}
        onClearAllFilters={discovery.handleClearAllFilters}
      />
      <HomeResultsSection
        isVisible={discovery.results.length > 0 || discovery.isLoading}
        sectionRef={discovery.resultsSectionRef}
        t={t}
        isLoading={discovery.isLoading}
        hideSeen={discovery.hideSeen}
        displayResults={discovery.displayResults}
        shownResultsCount={discovery.shownResultsCount}
        resultSortBy={discovery.resultSortBy}
        onResultSortChange={discovery.setResultSortBy}
        hasSourceResults={discovery.results.length > 0}
        onRefresh={discovery.handleRecommend}
        pagedResults={discovery.pagedResults}
        resultsTotalPages={discovery.resultsTotalPages}
        resultsPage={discovery.resultsPage}
        onResultsPageChange={discovery.handleResultsPageChange}
        onClearFilters={discovery.handleClearResultFilters}
      />
      <HomeEditorialSections
        isVisible={!discovery.results.length && !discovery.isLoading && discovery.collectionBlocks.length > 0}
        collectionBlocks={discovery.collectionBlocks}
        showAdult={showAdult}
      />
      <HomeContinueSection
        isVisible={showContinueSection}
        continueCards={continueWatching.continueCards}
        onContinueAdvance={continueWatching.handleContinueAdvance}
        onSetNextTarget={continueWatching.handleSetNextTarget}
        onCatchUpTarget={continueWatching.handleCatchUpTarget}
        onContinueComplete={continueWatching.handleContinueComplete}
        t={t}
      />
      <HomeTrendingSection
        isVisible={showTrendingSection}
        isInitialLoad={discovery.isInitialLoad}
        displayTrending={discovery.displayTrending}
        hideSeen={discovery.hideSeen}
        onHideSeenChange={discovery.setHideSeen}
        trendingSortBy={discovery.trendingSortBy}
        onTrendingSortChange={discovery.setTrendingSortBy}
        t={t}
      />
    </div>
  );
}

export default Home;
