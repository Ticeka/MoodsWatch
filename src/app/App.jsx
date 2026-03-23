import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { AuthProvider } from '@/features/auth/contexts/AuthContext';
import { WatchlistProvider } from '@/features/watchlist/contexts/WatchlistContext';
import { Layout } from '@/shared/components/layout/Layout';
import { LanguageProvider, useLanguage } from '@/shared/contexts/LanguageContext';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';
import { AgeGateProvider } from '@/shared/contexts/AgeGateContext';

const Home = lazy(() => import('@/features/titles/pages/Home').then((module) => ({ default: module.Home })));
const BattleHub = lazy(() => import('@/features/battle/pages/Battle').then((module) => ({ default: module.BattleHub })));
const BattleBuilderPage = lazy(() => import('@/features/battle/pages/Battle').then((module) => ({ default: module.BattleBuilderPage })));
const BattleDeckLibraryPage = lazy(() => import('@/features/battle/pages/Battle').then((module) => ({ default: module.BattleDeckLibraryPage })));
const BattleSessionPage = lazy(() => import('@/features/battle/pages/Battle').then((module) => ({ default: module.BattleSessionPage })));
const BattleLeaderboard = lazy(() => import('@/features/battle/pages/BattleLeaderboard').then((module) => ({ default: module.BattleLeaderboard })));
const DailyChallenge = lazy(() => import('@/features/battle/pages/DailyChallenge').then((module) => ({ default: module.DailyChallenge })));
const TierListBrowsePage = lazy(() => import('@/features/tierlist/pages/TierList').then((module) => ({ default: module.TierListBrowsePage })));
const TierListCreatePage = lazy(() => import('@/features/tierlist/pages/TierList').then((module) => ({ default: module.TierListCreatePage })));
const TierListPlayPage = lazy(() => import('@/features/tierlist/pages/TierList').then((module) => ({ default: module.TierListPlayPage })));
const TierListTemplatePage = lazy(() => import('@/features/tierlist/pages/TierList').then((module) => ({ default: module.TierListTemplatePage })));
const SongTierListPage = lazy(() => import('@/features/tierlist/pages/TierList').then((module) => ({ default: module.SongTierListPage })));
const Discover = lazy(() => import('@/features/discover/pages/Discover').then((module) => ({ default: module.Discover })));
const TitleDetail = lazy(() => import('@/features/titles/pages/TitleDetail').then((module) => ({ default: module.TitleDetail })));
const Watchlist = lazy(() => import('@/features/watchlist/pages/Watchlist').then((module) => ({ default: module.Watchlist })));
const Profile = lazy(() => import('@/features/profile/pages/Profile'));
const PublicProfile = lazy(() => import('@/features/profile/pages/PublicProfile').then((module) => ({ default: module.PublicProfile })));
const Feed = lazy(() => import('@/features/social/pages/Feed').then((module) => ({ default: module.Feed })));
const Stats = lazy(() => import('@/features/stats/pages/Stats').then((module) => ({ default: module.Stats })));
const Auth = lazy(() => import('@/features/auth/pages/Auth').then((module) => ({ default: module.Auth })));
const AdminLayout = lazy(() => import('@/features/admin/pages/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const AdminDashboard = lazy(() => import('@/features/admin/pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const AdminTitles = lazy(() => import('@/features/admin/pages/AdminTitles').then((module) => ({ default: module.AdminTitles })));
const AdminTitleEdit = lazy(() => import('@/features/admin/pages/AdminTitleEdit').then((module) => ({ default: module.AdminTitleEdit })));
const AdminMoods = lazy(() => import('@/features/admin/pages/AdminMoods').then((module) => ({ default: module.AdminMoods })));
const AdminUsers = lazy(() => import('@/features/admin/pages/AdminUsers').then((module) => ({ default: module.AdminUsers })));
const AdminAnalytics = lazy(() => import('@/features/admin/pages/AdminAnalytics').then((module) => ({ default: module.AdminAnalytics })));
const AdminContentReports = lazy(() => import('@/features/admin/pages/AdminContentReports').then((module) => ({ default: module.AdminContentReports })));
const AdminDuplicates = lazy(() => import('@/features/admin/pages/AdminDuplicates').then((module) => ({ default: module.AdminDuplicates })));
const AdminCollections = lazy(() => import('@/features/admin/pages/AdminCollections').then((module) => ({ default: module.AdminCollections })));
const AdminHomepage = lazy(() => import('@/features/admin/pages/AdminHomepage').then((module) => ({ default: module.AdminHomepage })));
const AdminRecommendationPreview = lazy(() => import('@/features/admin/pages/AdminRecommendationPreview').then((module) => ({ default: module.AdminRecommendationPreview })));
const AdminFetch = lazy(() => import('@/features/admin/pages/AdminFetch').then((module) => ({ default: module.AdminFetch })));
const AdminGuide = lazy(() => import('@/features/admin/pages/AdminGuide').then((module) => ({ default: module.AdminGuide })));
const AdminLinks = lazy(() => import('@/features/admin/pages/AdminLinks').then((module) => ({ default: module.AdminLinks })));
const AdminDailyChallenge = lazy(() => import('@/features/admin/pages/AdminDailyChallenge').then((module) => ({ default: module.AdminDailyChallenge })));

function PageLoader() {
  const { t } = useLanguage();

  return (
    <div
      className="flex justify-center items-center"
      style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="spinning-icon" style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>🌀</div>
      <div style={{ color: 'var(--text-secondary)' }}>{t('app.loadingContent')}</div>
    </div>
  );
}

function AdminFallback() {
  const { t } = useLanguage();

  return (
    <div className="admin-page-content" style={{ padding: '5rem', textAlign: 'center' }}>
      <h2>{t('app.adminPlaceholder')} 🚧</h2>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AgeGateProvider>
        <AuthProvider>
          <WatchlistProvider>
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
                    <Route index element={<Home />} />
                    <Route path="battle" element={<BattleHub />} />
                    <Route path="battle/build" element={<BattleBuilderPage />} />
                    <Route path="battle/decks" element={<BattleDeckLibraryPage />} />
                    <Route path="battle/leaderboard" element={<BattleLeaderboard />} />
                    <Route path="battle/daily" element={<DailyChallenge />} />
                    <Route path="battle/:sessionId" element={<BattleSessionPage />} />
                    <Route path="tierlist" element={<TierListBrowsePage />} />
                    <Route path="tierlist/create" element={<TierListCreatePage />} />
                    <Route path="tierlist/template/:templateId" element={<TierListTemplatePage />} />
                    <Route path="tierlist/play/:listId" element={<TierListPlayPage />} />
                    <Route path="tierlist/songs/:titleSlug" element={<SongTierListPage />} />
                    <Route path="discover" element={<Discover />} />
                    <Route path="title/:slug" element={<TitleDetail />} />
                    <Route path="watchlist" element={<Watchlist />} />
                    <Route
                      path="profile"
                      element={(
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      )}
                    />
                    <Route path="u/:username" element={<PublicProfile />} />
                    <Route
                      path="feed"
                      element={(
                        <ProtectedRoute>
                          <Feed />
                        </ProtectedRoute>
                      )}
                    />
                    <Route path="stats" element={<Stats />} />
                    <Route path="login" element={<Auth />} />
                    <Route
                      path="admin"
                      element={(
                        <ProtectedRoute allowedRoles={['admin', 'editor']}>
                          <AdminLayout />
                        </ProtectedRoute>
                      )}
                    >
                      <Route index element={<AdminDashboard />} />
                      <Route path="titles" element={<AdminTitles />} />
                      <Route path="titles/:id" element={<AdminTitleEdit />} />
                      <Route path="moods" element={<AdminMoods />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="analytics" element={<AdminAnalytics />} />
                      <Route path="reports" element={<AdminContentReports />} />
                      <Route path="duplicates" element={<AdminDuplicates />} />
                      <Route path="collections" element={<AdminCollections />} />
                      <Route path="homepage" element={<AdminHomepage />} />
                      <Route path="recommendations" element={<AdminRecommendationPreview />} />
                      <Route path="fetch" element={<AdminFetch />} />
                      <Route path="links" element={<AdminLinks />} />
                      <Route path="daily" element={<AdminDailyChallenge />} />
                      <Route path="guide" element={<AdminGuide />} />
                      <Route path="*" element={<AdminFallback />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </WatchlistProvider>
        </AuthProvider>
        </AgeGateProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;
