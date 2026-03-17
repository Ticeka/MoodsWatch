const fs = require('fs');

const replacements = [
  // Card.jsx
  ['src/shared/components/ui/Card.jsx', "from '../../contexts/WatchlistContext'", "from '@/features/watchlist/contexts/WatchlistContext'"],
  // Layout.jsx
  ['src/shared/components/layout/Layout.jsx', "from './Header'", "from '@/shared/components/layout/Header'"],
  // Header.jsx
  ['src/shared/components/layout/Header.jsx', "from '../../contexts/ThemeContext'", "from '@/shared/contexts/ThemeContext'"],
  ['src/shared/components/layout/Header.jsx', "from '../../contexts/AuthContext'", "from '@/features/auth/contexts/AuthContext'"],
  
  // Watchlist.jsx
  ['src/features/watchlist/pages/Watchlist.jsx', "from '../contexts/WatchlistContext'", "from '@/features/watchlist/contexts/WatchlistContext'"],
  ['src/features/watchlist/pages/Watchlist.jsx', "from '../data/moods'", "from '@/shared/data/moods'"],
  ['src/features/watchlist/pages/Watchlist.jsx', "from '../lib/recommend'", "from '@/features/discover/lib/recommend'"],
  ['src/features/watchlist/pages/Watchlist.jsx', "from '../components/ui/Card'", "from '@/shared/components/ui/Card'"],
  // WatchlistContext.jsx
  ['src/features/watchlist/contexts/WatchlistContext.jsx', "from '../lib/supabase'", "from '@/shared/lib/supabase'"],
  ['src/features/watchlist/contexts/WatchlistContext.jsx', "from './AuthContext'", "from '@/features/auth/contexts/AuthContext'"],
  
  // TitleDetail.jsx
  ['src/features/titles/pages/TitleDetail.jsx', "from '../lib/recommend'", "from '@/features/discover/lib/recommend'"],
  ['src/features/titles/pages/TitleDetail.jsx', "from '../contexts/WatchlistContext'", "from '@/features/watchlist/contexts/WatchlistContext'"],
  ['src/features/titles/pages/TitleDetail.jsx', "from '../data/moods'", "from '@/shared/data/moods'"],
  ['src/features/titles/pages/TitleDetail.jsx', "from '../components/ui/Button'", "from '@/shared/components/ui/Button'"],
  ['src/features/titles/pages/TitleDetail.jsx', "from '../components/ui/Card'", "from '@/shared/components/ui/Card'"],
  
  // Home.jsx
  ['src/features/titles/pages/Home.jsx', "from '../components/ui/Button'", "from '@/shared/components/ui/Button'"],
  ['src/features/titles/pages/Home.jsx', "from '../components/ui/Card'", "from '@/shared/components/ui/Card'"],
  ['src/features/titles/pages/Home.jsx', "from '../components/features/MoodSelector'", "from '@/features/discover/components/MoodSelector'"],
  ['src/features/titles/pages/Home.jsx', "from '../components/features/TimeSelector'", "from '@/features/discover/components/TimeSelector'"],
  ['src/features/titles/pages/Home.jsx', "from '../lib/recommend'", "from '@/features/discover/lib/recommend'"],
  ['src/features/titles/pages/Home.jsx', "from '../data/moods'", "from '@/shared/data/moods'"],
  
  // Discover.jsx
  ['src/features/discover/pages/Discover.jsx', "from '../components/ui/Card'", "from '@/shared/components/ui/Card'"],
  ['src/features/discover/pages/Discover.jsx', "from '../lib/recommend'", "from '@/features/discover/lib/recommend'"],
  
  // recommend.js
  ['src/features/discover/lib/recommend.js', "from '../data/titles'", "from '@/shared/data/titles'"],
  ['src/features/discover/lib/recommend.js', "from '../data/moods'", "from '@/shared/data/moods'"],
  ['src/features/discover/lib/recommend.js', "from './supabase'", "from '@/shared/lib/supabase'"],
  
  // Selectors
  ['src/features/discover/components/TimeSelector.jsx', "from '../../data/moods'", "from '@/shared/data/moods'"],
  ['src/features/discover/components/MoodSelector.jsx', "from '../../data/moods'", "from '@/shared/data/moods'"],
  
  // Auth.jsx
  ['src/features/auth/pages/Auth.jsx', "from '../contexts/AuthContext'", "from '@/features/auth/contexts/AuthContext'"],
  ['src/features/auth/pages/Auth.jsx', "from '../components/ui/Button'", "from '@/shared/components/ui/Button'"],
  
  // AuthContext.jsx
  ['src/features/auth/contexts/AuthContext.jsx', "from '../lib/supabase'", "from '@/shared/lib/supabase'"],
  
  // Admin pages
  ['src/features/admin/pages/AdminTitles.jsx', "from '../../lib/supabase'", "from '@/shared/lib/supabase'"],
  ['src/features/admin/pages/AdminTitleEdit.jsx', "from '../../lib/supabase'", "from '@/shared/lib/supabase'"],
  ['src/features/admin/pages/AdminDashboard.jsx', "from '../../contexts/AuthContext'", "from '@/features/auth/contexts/AuthContext'"],
  ['src/features/admin/pages/AdminDashboard.jsx', "from '../../lib/supabase'", "from '@/shared/lib/supabase'"],
  
  // main.jsx
  ['src/app/main.jsx', "from './App.jsx'", "from './App'"]
];

replacements.forEach(([file, oldStr, newStr]) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(oldStr, newStr);
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log('Fixed stragglers');
