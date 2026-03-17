import fs from 'fs';
import path from 'path';

const moves = [
  ['src/App.jsx', 'src/app/App.jsx'],
  ['src/App.css', 'src/app/App.css'],
  ['src/main.jsx', 'src/app/main.jsx'],
  ['src/index.css', 'src/app/index.css'],

  ['src/lib/supabase.js', 'src/shared/lib/supabase.js'],
  ['src/data/moods.js', 'src/shared/data/moods.js'],
  ['src/data/titles.js', 'src/shared/data/titles.js'],
  ['src/contexts/ThemeContext.jsx', 'src/shared/contexts/ThemeContext.jsx'],
  ['src/components/layout/Header.jsx', 'src/shared/components/layout/Header.jsx'],
  ['src/components/layout/Layout.jsx', 'src/shared/components/layout/Layout.jsx'],
  ['src/components/layout/Layout.css', 'src/shared/components/layout/Layout.css'],
  ['src/components/ui/Button.jsx', 'src/shared/components/ui/Button.jsx'],
  ['src/components/ui/Button.css', 'src/shared/components/ui/Button.css'],
  ['src/components/ui/Card.jsx', 'src/shared/components/ui/Card.jsx'],
  ['src/components/ui/Card.css', 'src/shared/components/ui/Card.css'],

  ['src/pages/Discover.jsx', 'src/features/discover/pages/Discover.jsx'],
  ['src/pages/Discover.css', 'src/features/discover/pages/Discover.css'],
  ['src/components/features/MoodSelector.jsx', 'src/features/discover/components/MoodSelector.jsx'],
  ['src/components/features/TimeSelector.jsx', 'src/features/discover/components/TimeSelector.jsx'],
  ['src/components/features/Selectors.css', 'src/features/discover/components/Selectors.css'],
  ['src/lib/recommend.js', 'src/features/discover/lib/recommend.js'],

  ['src/pages/Auth.jsx', 'src/features/auth/pages/Auth.jsx'],
  ['src/contexts/AuthContext.jsx', 'src/features/auth/contexts/AuthContext.jsx'],

  ['src/pages/Watchlist.jsx', 'src/features/watchlist/pages/Watchlist.jsx'],
  ['src/pages/Watchlist.css', 'src/features/watchlist/pages/Watchlist.css'],
  ['src/contexts/WatchlistContext.jsx', 'src/features/watchlist/contexts/WatchlistContext.jsx'],

  ['src/pages/Home.jsx', 'src/features/titles/pages/Home.jsx'],
  ['src/pages/Home.css', 'src/features/titles/pages/Home.css'],
  ['src/pages/TitleDetail.jsx', 'src/features/titles/pages/TitleDetail.jsx'],
  ['src/pages/TitleDetail.css', 'src/features/titles/pages/TitleDetail.css'],

  ['src/pages/admin/AdminDashboard.jsx', 'src/features/admin/pages/AdminDashboard.jsx'],
  ['src/pages/admin/AdminLayout.jsx', 'src/features/admin/pages/AdminLayout.jsx'],
  ['src/pages/admin/AdminTitles.jsx', 'src/features/admin/pages/AdminTitles.jsx'],
  ['src/pages/admin/AdminTitleEdit.jsx', 'src/features/admin/pages/AdminTitleEdit.jsx'],
  ['src/pages/admin/Admin.css', 'src/features/admin/styles/Admin.css']
];

const basePath = process.cwd();

// Find new path for a given absolute or relative old path
const findNewPath = (oldOriginalPathStr) => {
  let relativeOldPath = oldOriginalPathStr.replace(/\\/g, '/');
  
  if (relativeOldPath.startsWith(process.cwd().replace(/\\/g, '/'))) {
    relativeOldPath = relativeOldPath.replace(process.cwd().replace(/\\/g, '/') + '/', '');
  }
  
  const withoutExt = relativeOldPath.replace(/\.(js|jsx|css)$/, '');
  
  for (const [oldP, newP] of moves) {
    if (oldP === relativeOldPath || oldP.replace(/\.(js|jsx|css)$/, '') === withoutExt) {
      return newP;
    }
  }
  return null; // Note that assets like .svg might not be in the moves array and need to be handled
};

// Process file imports
const processFile = (oldPath, newPath) => {
  let content = fs.readFileSync(path.join(basePath, oldPath), 'utf8');
  const oldDir = path.dirname(path.join(basePath, oldPath));

  const replaceImport = (match, importPath) => {
    if (importPath.startsWith('.') || importPath.startsWith('..')) {
      const resolvedOldPath = path.resolve(oldDir, importPath);
      let newLocation = findNewPath(resolvedOldPath);
      if (newLocation) {
        // Build @/ string
        let newAliasPath = newLocation.replace(/^src\//, '@/');
        // remove extension if it wasn't requested in the original import
        if (!importPath.endsWith('.jsx') && !importPath.endsWith('.js') && !importPath.endsWith('.css')) {
            newAliasPath = newAliasPath.replace(/\.(jsx|js)$/, '');
        }
        return match.replace(importPath, newAliasPath);
      } else {
          // If not in moves (e.g. assets), keep it relative to the new dir!
          const newDir = path.dirname(path.join(basePath, newPath));
          let rel = path.relative(newDir, resolvedOldPath).replace(/\\/g, '/');
          if (!rel.startsWith('.')) rel = './' + rel;
          return match.replace(importPath, rel);
      }
    }
    return match;
  };

  // Replace JS imports
  content = content.replace(/(from|import)\s+['"]([^'"]+)['"]/g, replaceImport);
  content = content.replace(/import\s*\(\s*['"]([^'"]+)['"]/g, replaceImport);
  // Replace CSS url()
  content = content.replace(/url\(['"]?([^'"]+)['"]?\)/g, replaceImport);

  // Write content directly to new location, creating dirs if they don't exist
  const newAbsPath = path.join(basePath, newPath);
  fs.mkdirSync(path.dirname(newAbsPath), { recursive: true });
  fs.writeFileSync(newAbsPath, content, 'utf8');
};

console.log('Migrating files...');
moves.forEach(([oldP, newP]) => {
  if (fs.existsSync(path.join(basePath, oldP))) {
    processFile(oldP, newP);
  } else {
    console.log(`Missing file: ${oldP}`);
  }
});

console.log('Update index.html entry point...');
if(fs.existsSync(path.join(basePath, 'index.html'))) {
    let indexHtml = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');
    indexHtml = indexHtml.replace('/src/main.jsx', '/src/app/main.jsx');
    fs.writeFileSync(path.join(basePath, 'index.html'), indexHtml, 'utf8');
}

console.log('Cleaning up old directories...');
const deleteDirs = [
  'src/components',
  'src/contexts',
  'src/data',
  'src/lib',
  'src/pages'
];

deleteDirs.forEach(dir => {
    const full = path.join(basePath, dir);
    if(fs.existsSync(full)) {
        fs.rmSync(full, { recursive: true, force: true });
    }
});
// clean standalone old files manually just in case
['src/App.jsx', 'src/App.css', 'src/main.jsx', 'src/index.css'].forEach(f => {
    if(fs.existsSync(f)) fs.unlinkSync(f);
})

console.log('Refactoring complete!');
