import { spawn } from 'node:child_process';
import { loadEnv } from './load-env.mjs';

loadEnv();

const steps = [
  [
    'scripts/catalog/ingest-anilist.mjs',
    [
      '--type=ANIME',
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
  steps.splice(4, 0, [
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

for (const [script, args] of steps) {
  console.log(`Running ${script} ${args.join(' ')}`);
  await runScript(script, args);
}

console.log('All catalog ingestion steps completed.');
