/**
 * Search query expansion: synonym map, typo corrections, abbreviations.
 *
 * expandQuery(input) maps common user inputs to their canonical forms so the
 * ranking pipeline sees fully-spelled terms and gets better recall.
 *
 * All lookup keys are lowercase with single spaces (normalised by normKey()).
 * Values are the canonical expansion, also lowercase and space-separated.
 *
 * Priority order: typo corrections > abbreviations > genre synonyms.
 */

// ── Abbreviations / acronyms ─────────────────────────────────────────────────
// Common short-hands that the scoring pipeline won't recognise without expansion.
const ABBREVIATION_MAP = {
  'jjk':    'jujutsu kaisen',
  'mha':    'my hero academia',
  'bnha':   'my hero academia',
  'aot':    'attack on titan',
  'snk':    'shingeki no kyojin',
  'kny':    'kimetsu no yaiba',
  'fma':    'fullmetal alchemist',
  'opm':    'one punch man',
  'sao':    'sword art online',
  'hxh':    'hunter x hunter',
  'csm':    'chainsaw man',
  'tpn':    'the promised neverland',
  'bsd':    'bungou stray dogs',
  'mob':    'mob psycho 100',
  'rezero': 're zero',
  're0':    're zero',
  'dbs':    'dragon ball super',
  'dbz':    'dragon ball z',
};

// ── Common typo corrections ───────────────────────────────────────────────────
// Misspellings that the Damerau-Levenshtein fuzzy matcher struggles with because
// they differ by more than one edit or are phonetic substitutions.
const TYPO_MAP = {
  'narotu':              'naruto',
  'naurto':              'naruto',
  'narutp':              'naruto',
  'onepeice':            'one piece',
  'one peice':           'one piece',
  'on piece':            'one piece',
  'draon ball':          'dragon ball',
  'drangon ball':        'dragon ball',
  'bleech':              'bleach',
  'jujitsu kaisen':      'jujutsu kaisen',
  'jujustu kaisen':      'jujutsu kaisen',
  'jujutu kaisen':       'jujutsu kaisen',
  'demon slyer':         'demon slayer',
  'demon slater':        'demon slayer',
  'tokyo goul':          'tokyo ghoul',
  'tokyo ghul':          'tokyo ghoul',
  'fullmetal alchamist': 'fullmetal alchemist',
  'fulemetal alchemist': 'fullmetal alchemist',
  'bungou stary dogs':   'bungou stray dogs',
  'vineland saga':       'vinland saga',
  'chinsow man':         'chainsaw man',
  'shingek':             'shingeki no kyojin',
  'sword art online':    'sword art online',
};

// ── Genre / mood / category synonyms ─────────────────────────────────────────
// Map informal or abbreviated genre terms to canonical vocabulary used in
// the catalog's genres/moods fields.
const SYNONYM_MAP = {
  'romcom':       'romance comedy',
  'rom com':      'romance comedy',
  'sol':          'slice of life',
  'iyashikei':    'healing slice of life',
  'shonen':       'shounen',
  'mahou shoujo': 'magical girl',
  'mecha':        'mecha robot',
  'harem':        'harem romance',
  'villainess':   'villainess reincarnation isekai',
  'op mc':        'overpowered protagonist',
  'sport':        'sports',
  'wuxia':        'wuxia cultivation martial arts',
  'cultivation':  'cultivation wuxia',
  'yaoi':         'boys love',
  'yuri':         'girls love',
  'shounen ai':   'boys love',
  'shoujo ai':    'girls love',
  'ecchi':        'ecchi romance',
  'isekai':       'isekai',
  'josei':        'josei romance',
};

// ── Combined lookup (more specific wins) ─────────────────────────────────────
const LOOKUP = { ...SYNONYM_MAP, ...ABBREVIATION_MAP, ...TYPO_MAP };

function normKey(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expand a (trimmed) search input using the synonym / abbreviation / typo map.
 *
 * - Returns the expanded string if an entry matches.
 * - Falls back to token-level expansion for multi-word inputs.
 * - Returns the normalised key unchanged if nothing matches.
 */
export function expandQuery(input) {
  if (!input || input.length < 2) return input;

  const key = normKey(input);

  // Exact phrase match (covers multi-word entries like "rom com", "one peice")
  const direct = LOOKUP[key];
  if (direct) return direct;

  // Token-level expansion for compound queries, e.g. "jjk isekai"
  const tokens = key.split(' ');
  if (tokens.length > 1) {
    const expandedTokens = tokens.map((token) => LOOKUP[token] || token);
    const result = expandedTokens.join(' ');
    if (result !== key) return result;
  }

  return key;
}
