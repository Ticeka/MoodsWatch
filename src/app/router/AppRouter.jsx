import React, { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { Layout } from '@/shared/components/layout/Layout';
import {
  AdminAnalyticsPage,
  AdminCollectionsPage,
  AdminContentReportsPage,
  AdminDailyChallengePage,
  AdminDashboardPage,
  AdminDuplicatesPage,
  AdminFetchPage,
  AdminGuidePage,
  AdminHomepagePage,
  AdminLayoutPage,
  AdminLinksPage,
  AdminMoodsPage,
  AdminPartyPresetsPage,
  AdminRecommendationPreviewPage,
  AdminDonatePage,
  AdminSupportModalPage,
  AdminTierlistsPage,
  AdminTitleEditPage,
  AdminTitlesPage,
  AdminUsersPage,
  AuthPage,
  BattleBrowsePage,
  BattleBuilderPage,
  BattleDeckLibraryPage,
  BattleHubPage,
  BattleLeaderboardPage,
  BattleSessionPage,
  DailyChallengePage,
  DiscoverPage,
  FeedPage,
  HomePage,
  PartyHubPage,
  PartyRoomDirectoryPage,
  PartyRoomPage,
  PartyTemplateBuilderPage,
  PartyTemplateDetailPage,
  PartyTemplatesPage,
  ProfilePage,
  PublicProfilePage,
  SongTierListBrowsePage,
  SongTierListPage,
  StatsPage,
  TierListBrowsePage,
  TierListCreatePage,
  TierListManagePage,
  TierListPlayPage,
  TierListTemplatePage,
  TitleCharacterDetailPage,
  TitleDetailPage,
  TitleStaffDetailPage,
  WatchlistPage,
} from './lazyPages';
import { AdminFallback, LegacyPartyTitleGuessCreateRedirect, PageLoader } from './routeElements';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          },
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="battle" element={<BattleHubPage />} />
            <Route path="battle/browse" element={<BattleBrowsePage />} />
            <Route path="battle/build" element={<BattleBuilderPage />} />
            <Route path="battle/decks" element={<BattleDeckLibraryPage />} />
            <Route path="battle/leaderboard" element={<BattleLeaderboardPage />} />
            <Route path="battle/daily" element={<DailyChallengePage />} />
            <Route path="battle/:sessionId" element={<BattleSessionPage />} />
            <Route path="party" element={<PartyHubPage />} />
            <Route path="party/rooms" element={<PartyRoomDirectoryPage />} />
            <Route path="party/templates" element={<PartyTemplatesPage />} />
            <Route path="party/templates/create" element={<PartyTemplateBuilderPage />} />
            <Route path="party/title-guess/create" element={<LegacyPartyTitleGuessCreateRedirect />} />
            <Route path="party/templates/:templateId" element={<PartyTemplateDetailPage />} />
            <Route path="party/room/:roomCode" element={<PartyRoomPage />} />
            <Route path="tierlist" element={<TierListBrowsePage />} />
            <Route
              path="tierlist/me"
              element={(
                <ProtectedRoute>
                  <TierListManagePage />
                </ProtectedRoute>
              )}
            />
            <Route path="tierlist/create" element={<TierListCreatePage />} />
            <Route path="tierlist/template/:templateId" element={<TierListTemplatePage />} />
            <Route path="tierlist/play/:listId" element={<TierListPlayPage />} />
            <Route path="tierlist/songs" element={<SongTierListBrowsePage />} />
            <Route path="tierlist/songs/:titleSlug" element={<SongTierListPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="title/:slug/character/:personId" element={<TitleCharacterDetailPage />} />
            <Route path="title/:slug/staff/:personId" element={<TitleStaffDetailPage />} />
            <Route path="title/:slug" element={<TitleDetailPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
            <Route
              path="profile"
              element={(
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              )}
            />
            <Route path="u/:username" element={<PublicProfilePage />} />
            <Route
              path="feed"
              element={(
                <ProtectedRoute>
                  <FeedPage />
                </ProtectedRoute>
              )}
            />
            <Route path="stats" element={<StatsPage />} />
            <Route path="login" element={<AuthPage />} />
            <Route
              path="admin"
              element={(
                <ProtectedRoute allowedRoles={['admin', 'editor']}>
                  <AdminLayoutPage />
                </ProtectedRoute>
              )}
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="titles" element={<AdminTitlesPage />} />
              <Route path="titles/:id" element={<AdminTitleEditPage />} />
              <Route path="moods" element={<AdminMoodsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="reports" element={<AdminContentReportsPage />} />
              <Route path="duplicates" element={<AdminDuplicatesPage />} />
              <Route path="collections" element={<AdminCollectionsPage />} />
              <Route path="homepage" element={<AdminHomepagePage />} />
              <Route path="recommendations" element={<AdminRecommendationPreviewPage />} />
              <Route path="donate" element={<AdminDonatePage />} />
              <Route path="support-modal" element={<AdminSupportModalPage />} />
              <Route path="fetch" element={<AdminFetchPage />} />
              <Route path="links" element={<AdminLinksPage />} />
              <Route path="daily" element={<AdminDailyChallengePage />} />
              <Route path="tierlists" element={<AdminTierlistsPage />} />
              <Route path="party-presets" element={<AdminPartyPresetsPage />} />
              <Route path="guide" element={<AdminGuidePage />} />
              <Route path="*" element={<AdminFallback />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
  );
}

export default AppRouter;
