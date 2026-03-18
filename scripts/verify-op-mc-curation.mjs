import fs from 'node:fs';

function loadEnvFile(path = '.env') {
  const raw = fs.readFileSync(path, 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

async function fetchAllTitles(env) {
  const headers = {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  };

  const rows = [];
  let offset = 0;

  while (true) {
    const url = `${env.VITE_SUPABASE_URL}/rest/v1/canonical_titles?select=slug,canonical_title,title_moods(mood_id)&limit=1000&offset=${offset}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
    }

    const batch = await response.json();
    rows.push(...batch);

    if (batch.length < 1000) {
      break;
    }

    offset += 1000;
  }

  return rows;
}

function hasOpMc(row) {
  return (row.title_moods || []).some((mood) => mood.mood_id === 'op-mc');
}

const EXPECTED_OP_MC_SLUGS = [
  'solo-leveling-105398',
  'solo-leveling-151807',
  'solo-leveling-season-2-arise-from-the-shadow-176496',
  'solo-leveling-ragnarok-179445',
  'solo-leveling-reawakening-184694',
  'one-punch-man-21087',
  'one-punch-man-85364',
  'black-clover-97940',
  'black-clover-sword-of-the-wizard-king-131680',
  'bleach-269',
  'bleach-30012',
  'bleach-thousand-year-blood-war-116674',
  'bleach-thousand-year-blood-war-the-separation-159322',
  'bleach-thousand-year-blood-war-the-conflict-169755',
  'naruto-20',
  'naruto-shippuden-1735',
  'naruto-30011',
  'dragon-ball-223',
  'dragon-ball-z-813',
  'dragon-ball-30042',
  'dragon-ball-super-broly-101302',
  'mob-psycho-100-21507',
  'mob-psycho-100-ii-101338',
  'mob-psycho-100-iii-140439',
  'mob-psycho-100-85189',
  'that-time-i-got-reincarnated-as-a-slime-101280',
  'that-time-i-got-reincarnated-as-a-slime-season-2-108511',
  'that-time-i-got-reincarnated-as-a-slime-season-2-part-2-116742',
  'that-time-i-got-reincarnated-as-a-slime-86355',
  'the-eminence-in-shadow-130298',
  'the-eminence-in-shadow-season-2-161964',
  'the-eminence-in-shadow-108428',
  'overlord-iv-133844',
  'no-game-no-life-zero-21875',
  'no-game-no-life-78399',
  'sword-art-online-progressive-73921',
  'sword-art-online-the-movie-progressive-aria-of-a-starless-night-124140',
  'mashle-magic-and-muscles-season-2-166610',
  'tsukimichi-moonlit-fantasy-season-2-139518',
  'the-disastrous-life-of-saiki-k-season-2-98034',
  'saiki-kusuo-no-nan-67755',
  'hellsing-30267',
  'trigun-6',
  'trigun-maximum-30704',
  'trigun-stampede-151040',
  'code-geass-lelouch-of-the-rebellion-1575',
  'code-geass-lelouch-of-the-rebellion-r2-2904',
  'classroom-of-the-elite-94970',
  'classroom-of-the-elite-season-2-145545',
  'classroom-of-the-elite-season-3-146066',
  'classroom-of-the-elite-year-2-115166',
  'the-kings-avatar-for-the-glory-108981',
  'omniscient-reader-119257',
  'the-god-of-high-school-85141',
  'nano-machine-120980',
  'second-life-ranker-109957',
  'overgeared-117460',
  'teenage-mercenary-126297',
  'hardcore-leveling-warrior-101134',
  'the-return-of-the-disaster-class-hero-143056',
  'the-academys-undercover-professor-150836',
  'a-returners-magic-should-be-special-105393',
  'the-legend-of-the-northern-blade-119521',
  'god-of-blackfield-118267',
  'the-breaker-38586',
  'the-breaker-new-waves-52651',
  'latna-saga-survival-of-a-sword-king-114605',
  'descent-of-the-demon-master-113607',
  'the-world-after-the-fall-144957',
  'log-in-murim-120385',
  'after-ten-millennia-in-hell-153284',
  'the-100th-regression-of-the-max-level-player-170894',
  'weak-hero-113488',
  'saga-of-tanya-the-evil-the-movie-100878',
  'the-saga-of-tanya-the-evil-94846',
  'noblesse-59983',
  'eleceed-106929',
  'sakamoto-days-125828',
  'kaiju-no-8-153288',
  'kaiju-no-8-season-2-178754',
  'the-player-hides-his-past-166154',
  'sss-class-revival-hunter-128067',
  'return-of-the-mad-demon-137304',
  'chronicles-of-the-demon-faction-164222',
  'absolute-regression-180891',
];

const KNOWN_FALSE_POSITIVES = [
  'your-name-21519',
  'death-note-1535',
  'haikyu-20464',
];

async function main() {
  const env = loadEnvFile();
  const rows = await fetchAllTitles(env);
  const opMcRows = rows.filter(hasOpMc);
  const opMcSlugs = new Set(opMcRows.map((row) => row.slug));

  const missingExpected = EXPECTED_OP_MC_SLUGS.filter((slug) => !opMcSlugs.has(slug));
  const unexpected = opMcRows.filter((row) => !EXPECTED_OP_MC_SLUGS.includes(row.slug));
  const falsePositives = KNOWN_FALSE_POSITIVES.filter((slug) => opMcSlugs.has(slug));

  console.log(`op-mc titles: ${opMcRows.length}`);

  if (missingExpected.length > 0) {
    console.error('Missing expected op-mc slugs:');
    missingExpected.forEach((slug) => console.error(`- ${slug}`));
  }

  if (unexpected.length > 0) {
    console.error('Unexpected op-mc titles:');
    unexpected.forEach((row) => console.error(`- ${row.slug}\t${row.canonical_title}`));
  }

  if (falsePositives.length > 0) {
    console.error('Known false positives still tagged as op-mc:');
    falsePositives.forEach((slug) => console.error(`- ${slug}`));
  }

  if (missingExpected.length > 0 || unexpected.length > 0 || falsePositives.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('op-mc curation looks consistent.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
