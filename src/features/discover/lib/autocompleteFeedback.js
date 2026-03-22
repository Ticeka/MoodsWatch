const AUTOCOMPLETE_FEEDBACK_KEY = 'moodswatch-autocomplete-feedback';
const MAX_QUERY_BUCKETS = 24;
const MAX_ITEMS_PER_QUERY = 16;
const MAX_GLOBAL_ITEMS = 48;

function safeLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase();
}

function readFeedbackStore() {
  const storage = safeLocalStorage();
  if (!storage) {
    return { byQuery: {}, global: {} };
  }

  try {
    const raw = storage.getItem(AUTOCOMPLETE_FEEDBACK_KEY);
    if (!raw) {
      return { byQuery: {}, global: {} };
    }

    const parsed = JSON.parse(raw);
    return {
      byQuery: parsed?.byQuery && typeof parsed.byQuery === 'object' ? parsed.byQuery : {},
      global: parsed?.global && typeof parsed.global === 'object' ? parsed.global : {},
    };
  } catch {
    return { byQuery: {}, global: {} };
  }
}

function trimEntries(entries = {}, limit = 12) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
      .slice(0, limit)
  );
}

function writeFeedbackStore(store) {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }

  try {
    const sortedQueries = Object.entries(store?.byQuery || {})
      .sort((left, right) => {
        const leftBest = Math.max(...Object.values(left[1] || {}).map((value) => Number(value || 0)), 0);
        const rightBest = Math.max(...Object.values(right[1] || {}).map((value) => Number(value || 0)), 0);
        return rightBest - leftBest;
      })
      .slice(0, MAX_QUERY_BUCKETS)
      .reduce((acc, [query, items]) => {
        acc[query] = trimEntries(items, MAX_ITEMS_PER_QUERY);
        return acc;
      }, {});

    storage.setItem(AUTOCOMPLETE_FEEDBACK_KEY, JSON.stringify({
      byQuery: sortedQueries,
      global: trimEntries(store?.global || {}, MAX_GLOBAL_ITEMS),
    }));
  } catch {
    // Ignore storage failures.
  }
}

export function recordAutocompleteSelection({ query = '', itemId = '' } = {}) {
  const normalizedQuery = normalizeQuery(query);
  const normalizedItemId = String(itemId || '').trim();

  if (!normalizedItemId) {
    return;
  }

  const store = readFeedbackStore();
  const nextStore = {
    byQuery: { ...store.byQuery },
    global: { ...store.global },
  };

  nextStore.global[normalizedItemId] = Number(nextStore.global[normalizedItemId] || 0) + 1;

  if (normalizedQuery) {
    const currentBucket = nextStore.byQuery[normalizedQuery] && typeof nextStore.byQuery[normalizedQuery] === 'object'
      ? nextStore.byQuery[normalizedQuery]
      : {};

    nextStore.byQuery[normalizedQuery] = {
      ...currentBucket,
      [normalizedItemId]: Number(currentBucket[normalizedItemId] || 0) + 1,
    };
  }

  writeFeedbackStore(nextStore);
}

export function getAutocompleteSelectionBoost(query = '', itemId = '') {
  const normalizedQuery = normalizeQuery(query);
  const normalizedItemId = String(itemId || '').trim();

  if (!normalizedItemId) {
    return 0;
  }

  const store = readFeedbackStore();
  const queryCount = normalizedQuery ? Number(store.byQuery?.[normalizedQuery]?.[normalizedItemId] || 0) : 0;
  const globalCount = Number(store.global?.[normalizedItemId] || 0);

  return (queryCount * 40) + (globalCount * 10);
}
