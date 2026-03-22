import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fn, vi } from '@storybook/test';
import { Header } from './Header';

// ── Mock all Header dependencies ──────────────────────────────────────────

vi.mock('@/features/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, signOut: fn() }),
}));

vi.mock('@/shared/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'th',
    setLanguage: fn(),
    t: (key) => key,
  }),
}));

vi.mock('@/shared/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: fn() }),
}));

// supabase is used by NotificationBell — stub to prevent network calls
vi.mock('@/shared/lib/supabase', () => ({
  supabase: null,
  isSupabaseConnected: () => false,
}));

// ── Mock user objects ──────────────────────────────────────────────────────
const loggedInAuth = {
  user: {
    email: 'demo@moodswatch.app',
    profile: { name: 'Demo User', role: 'user', avatar_url: null },
  },
  signOut: fn(),
};

const adminAuth = {
  user: {
    email: 'admin@moodswatch.app',
    profile: { name: 'Admin', role: 'admin', avatar_url: null },
  },
  signOut: fn(),
};

// Helper decorator — wraps story with MemoryRouter at a given path
function withRouter(path = '/') {
  return (Story) => (
    <MemoryRouter initialEntries={[path]}>
      <Story />
    </MemoryRouter>
  );
}

// ── Config ─────────────────────────────────────────────────────────────────
export default {
  title: 'Layout/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
  },
};

// ── Stories ────────────────────────────────────────────────────────────────

export const Guest = {
  name: 'Guest (not logged in)',
  decorators: [withRouter('/')],
};

export const LoggedIn = {
  name: 'Logged in — user',
  decorators: [
    (Story) => {
      vi.mock('@/features/auth/contexts/AuthContext', () => ({
        useAuth: () => loggedInAuth,
      }));
      return withRouter('/')(Story);
    },
  ],
};

export const AdminUser = {
  name: 'Logged in — admin (admin badge visible)',
  decorators: [
    (Story) => {
      vi.mock('@/features/auth/contexts/AuthContext', () => ({
        useAuth: () => adminAuth,
      }));
      return withRouter('/')(Story);
    },
  ],
};

export const OnDiscoverPage = {
  name: 'Active nav: Discover',
  decorators: [withRouter('/discover')],
};

export const OnWatchlistPage = {
  name: 'Active nav: Watchlist',
  decorators: [withRouter('/watchlist')],
};

export const DarkTheme = {
  name: 'Dark theme',
  decorators: [withRouter('/')],
  parameters: {
    backgrounds: { default: 'dark' },
    themes: { default: 'dark' },
  },
};

export const MobileGuest = {
  name: 'Mobile — guest (375px)',
  decorators: [withRouter('/')],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const MobileLoggedIn = {
  name: 'Mobile — logged in (375px)',
  decorators: [
    (Story) => {
      vi.mock('@/features/auth/contexts/AuthContext', () => ({
        useAuth: () => loggedInAuth,
      }));
      return withRouter('/')(Story);
    },
  ],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
