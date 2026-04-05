import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './load-env.mjs';

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

const [{ createClient }, { slugify, normalizeCatalogTitle }] = await Promise.all([
  import('@supabase/supabase-js'),
  import('./catalog-upsert.mjs'),
]);

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseArgs(argv) {
  const parsed = {
    input: '',
    dryRun: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--limit') {
      parsed.limit = Number(argv[index + 1] || 0) || null;
      index += 1;
      continue;
    }
    if (!parsed.input) {
      parsed.input = token;
    }
  }

  return parsed;
}

async function listAllCanonicalTitles() {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseAdmin
      .from('canonical_titles')
      .select('id, slug, canonical_title, popularity_score, aliases_cache')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function buildLookup(rows) {
  const lookup = new Map();

  for (const row of rows) {
    const candidates = [row.canonical_title];
    if (Array.isArray(row.aliases_cache)) {
      for (const alias of row.aliases_cache) {
        candidates.push(alias?.alias);
      }
    }

    for (const candidate of candidates) {
      const normalized = normalizeCatalogTitle(candidate);
      if (!normalized) continue;
      const list = lookup.get(normalized) || [];
      list.push(row);
      lookup.set(normalized, list);
    }
  }

  return lookup;
}

function pickBestTitleMatch(sourceTitle, candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const normalizedSource = normalizeCatalogTitle(sourceTitle);
  const exactCanonical = candidates.find((candidate) => normalizeCatalogTitle(candidate.canonical_title) === normalizedSource);
  if (exactCanonical) return exactCanonical;

  return [...candidates].sort((left, right) => (right.popularity_score || 0) - (left.popularity_score || 0))[0];
}

function dedupeMembershipRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = String(row.canonical_title_id);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

async function replaceMemberships(franchiseId, membershipRows) {
  const { error: deleteError } = await supabaseAdmin
    .from('title_franchise_memberships')
    .delete()
    .eq('franchise_id', franchiseId);

  if (deleteError) throw deleteError;

  if (!membershipRows.length) return;

  const { error: insertError } = await supabaseAdmin
    .from('title_franchise_memberships')
    .insert(membershipRows);

  if (insertError) throw insertError;
}

async function upsertFranchise(record, membershipRows, unmatchedTitles) {
  const payload = {
    slug: String(record.slug || slugify(record.franchise || record.id || 'franchise')).trim(),
    franchise_name: String(record.franchise || '').trim(),
    aliases: [String(record.franchise || '').trim()].filter(Boolean),
    source_provider: 'manual',
    source_id: String(record.id || '').trim() || null,
    source_title_count: Number(record.title_count || record.member_titles?.length || 0),
    matched_title_count: membershipRows.length,
    entry_type_counts: record.entry_type_counts || {},
    member_titles: Array.isArray(record.member_titles) ? record.member_titles : [],
    unmatched_titles: unmatchedTitles,
    raw_payload: record,
    last_synced_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('franchises')
    .upsert(payload, { onConflict: 'slug' })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error('Usage: node scripts/catalog/import-franchises.mjs <path-to-json> [--dry-run] [--limit N]');
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const records = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const titles = await listAllCanonicalTitles();
  const lookup = buildLookup(titles);

  const selectedRecords = args.limit ? records.slice(0, args.limit) : records;
  const stats = {
    totalFranchises: selectedRecords.length,
    importedFranchises: 0,
    matchedTitles: 0,
    unmatchedTitles: 0,
    unmatchedByFranchise: [],
  };

  for (const record of selectedRecords) {
    const rawMembershipRows = [];
    const unmatchedTitles = [];

    for (const [index, sourceTitle] of (record.member_titles || []).entries()) {
      const normalized = normalizeCatalogTitle(sourceTitle);
      const match = pickBestTitleMatch(sourceTitle, lookup.get(normalized) || []);

      if (!match) {
        unmatchedTitles.push(sourceTitle);
        stats.unmatchedTitles += 1;
        continue;
      }

      rawMembershipRows.push({
        canonical_title_id: match.id,
        membership_order: index,
        source_title: sourceTitle,
        source_provider: 'manual',
        is_primary: index === 0,
      });
      stats.matchedTitles += 1;
    }

    const membershipRows = dedupeMembershipRows(rawMembershipRows);

    if (unmatchedTitles.length) {
      stats.unmatchedByFranchise.push({
        id: record.id,
        franchise: record.franchise,
        unmatchedTitles,
      });
    }

    if (args.dryRun) {
      continue;
    }

    const franchiseId = await upsertFranchise(record, membershipRows, unmatchedTitles);
    await replaceMemberships(
      franchiseId,
      membershipRows.map((row) => ({
        franchise_id: franchiseId,
        ...row,
      })),
    );
    stats.importedFranchises += 1;
  }

  console.log(JSON.stringify(stats, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
