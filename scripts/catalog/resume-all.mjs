import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './load-env.mjs';

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function runScript(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function getResumePages(perPage = 25) {
  const { data, error } = await supabase
    .from('title_source_refs')
    .select('provider, canonical_titles!inner(type, origin_country)')
    .eq('provider', 'anilist');

  if (error) throw error;

  const counts = { anime: 0, mangaJP: 0, manhwaKR: 0 };

  for (const row of data || []) {
    const title = row.canonical_titles;
    if (title.type === 'anime') counts.anime += 1;
    if (title.type === 'manga' && title.origin_country === 'JP') counts.mangaJP += 1;
    if (title.type === 'manga' && title.origin_country === 'KR') counts.manhwaKR += 1;
  }

  return {
    counts,
    animeStartPage: Math.floor(counts.anime / perPage) + 1,
    mangaJPStartPage: Math.floor(counts.mangaJP / perPage) + 1,
    manhwaKRStartPage: Math.floor(counts.manhwaKR / perPage) + 1,
  };
}

const { counts, animeStartPage, mangaJPStartPage, manhwaKRStartPage } = await getResumePages();

console.log(
  JSON.stringify(
    {
      counts,
      resume: { animeStartPage, mangaJPStartPage, manhwaKRStartPage },
    },
    null,
    2,
  ),
);

const steps = [
  [
    'scripts/catalog/ingest-anilist.mjs',
    [
      '--type=ANIME',
      `--startPage=${animeStartPage}`,
      '--all=true',
      '--perPage=25',
      '--formatIn=TV,MOVIE',
      '--status=FINISHED',
      '--averageScoreGreater=75',
      '--popularityGreater=10000',
      '--sort=POPULARITY_DESC',
    ],
  ],
  [
    'scripts/catalog/ingest-anilist.mjs',
    [
      '--type=MANGA',
      `--startPage=${manhwaKRStartPage}`,
      '--all=true',
      '--perPage=25',
      '--countryOfOrigin=KR',
      '--averageScoreGreater=70',
      '--popularityGreater=2000',
      '--sort=POPULARITY_DESC',
    ],
  ],
  [
    'scripts/catalog/ingest-anilist.mjs',
    [
      '--type=MANGA',
      '--pages=6',
      '--perPage=25',
      '--countryOfOrigin=KR',
      '--status=RELEASING',
      '--isAdult=true',
      '--sort=START_DATE_DESC',
    ],
  ],
  [
    'scripts/catalog/ingest-anilist.mjs',
    [
      '--type=MANGA',
      `--startPage=${mangaJPStartPage}`,
      '--all=true',
      '--perPage=25',
      '--countryOfOrigin=JP',
      '--averageScoreGreater=80',
      '--popularityGreater=2000',
      '--sort=POPULARITY_DESC',
    ],
  ],
  [
    'scripts/catalog/ingest-jikan.mjs',
    [
      '--pages=8',
      '--perPage=25',
      '--orderBy=start_date',
      '--direction=desc',
      '--excludeBoysLove=true',
    ],
  ],
  ['scripts/catalog/dedupe-catalog.mjs', []],
];

if (process.env.PORNHWADB_API_KEY) {
  steps.splice(5, 0, [
    'scripts/catalog/ingest-pornhwadb.mjs',
    [
      '--pages=10',
      '--limit=50',
      '--sort=updated_at',
      '--order=desc',
      '--status=On Going',
    ],
  ]);
} else {
  console.log('Skipping PornhwaDB sync because PORNHWADB_API_KEY is not configured.');
}

for (const [script, args] of steps) {
  console.log(`Running ${script} ${args.join(' ')}`);
  await runScript(script, args);
}

console.log('Catalog resume sync completed.');
