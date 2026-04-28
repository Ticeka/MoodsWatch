// Test-only helpers for recording Supabase query shapes.
//
// Use vi.hoisted to declare a `mockState` object literal in each test file.
// Then call `attachDefaultRecorder(mockState)` in beforeEach to wire fluent
// builders (.from / .rpc) that record every roundtrip into mockState.ops and
// mockState.rpcCalls. Tests assert on those arrays to verify query shape,
// pagination, ordering, and roundtrip count.
//
// This file lives under src/ so the `@/` alias resolves cleanly from tests,
// but it imports `vitest` and is never referenced by app code, so production
// bundles tree-shake it out.

import { vi } from 'vitest';

export function createMockState() {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
    ops: [],
    rpcCalls: [],
    tableHandlers: new Map(),
    rpcHandlers: new Map(),
  };
}

function delay(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(table, action, mockState, opts = {}) {
  const filters = [];
  const orders = [];
  const latencyMs = Number(opts.latencyMs || 0);
  let limitVal = null;
  let rangeVal = null;
  let isMaybeSingle = false;
  let select = null;
  let committed = false;

  function commitSync() {
    if (committed) {
      return mockState.lastResult;
    }
    committed = true;
    const op = {
      table,
      action,
      select,
      filters: filters.slice(),
      orders: orders.slice(),
      limit: limitVal,
      range: rangeVal,
      maybeSingle: isMaybeSingle,
    };
    mockState.ops.push(op);
    const handler = mockState.tableHandlers.get(table);
    const result = handler ? handler(op) : { data: [], error: null };
    mockState.lastResult = result;
    return result;
  }

  function commitAsync() {
    return delay(latencyMs).then(() => commitSync());
  }

  const builder = {
    select(cols) { select = cols; return builder; },
    eq(col, val) { filters.push({ kind: 'eq', col, val }); return builder; },
    neq(col, val) { filters.push({ kind: 'neq', col, val }); return builder; },
    in(col, vals) { filters.push({ kind: 'in', col, vals: Array.isArray(vals) ? [...vals] : vals }); return builder; },
    gte(col, val) { filters.push({ kind: 'gte', col, val }); return builder; },
    lte(col, val) { filters.push({ kind: 'lte', col, val }); return builder; },
    or(expr) { filters.push({ kind: 'or', expr }); return builder; },
    is(col, val) { filters.push({ kind: 'is', col, val }); return builder; },
    order(col, options) { orders.push({ col, options }); return builder; },
    limit(n) { limitVal = n; return builder; },
    range(a, b) { rangeVal = [a, b]; return builder; },
    maybeSingle() {
      isMaybeSingle = true;
      return commitAsync();
    },
    single() {
      isMaybeSingle = true;
      return commitAsync();
    },
    then(resolve, reject) {
      return commitAsync().then(resolve, reject);
    },
  };
  return builder;
}

export function attachDefaultRecorder(mockState, options = {}) {
  const latencyMs = Number(options.latencyMs || 0);

  mockState.from.mockImplementation((table) => ({
    select: (cols) => {
      const builder = buildQuery(table, 'select', mockState, { latencyMs });
      return builder.select(cols);
    },
    insert: vi.fn(async (payload) => {
      await delay(latencyMs);
      mockState.ops.push({ table, action: 'insert', payload });
      return { data: payload, error: null };
    }),
    upsert: vi.fn(async (payload, opt) => {
      await delay(latencyMs);
      mockState.ops.push({ table, action: 'upsert', payload, options: opt });
      return { error: null };
    }),
    update: vi.fn(() => buildQuery(table, 'update', mockState, { latencyMs })),
    delete: vi.fn(() => buildQuery(table, 'delete', mockState, { latencyMs })),
  }));

  mockState.rpc.mockImplementation(async (name, params) => {
    await delay(latencyMs);
    mockState.rpcCalls.push({ name, params });
    const handler = mockState.rpcHandlers.get(name);
    return handler ? await handler({ name, params }) : { data: [], error: null };
  });
}

export function resetMockState(mockState) {
  mockState.ops.length = 0;
  mockState.rpcCalls.length = 0;
  mockState.tableHandlers.clear();
  mockState.rpcHandlers.clear();
  mockState.lastResult = undefined;
}

export function setTableHandler(mockState, table, handler) {
  mockState.tableHandlers.set(table, handler);
}

export function setRpcHandler(mockState, name, handler) {
  mockState.rpcHandlers.set(name, handler);
}

export function countOps(mockState, predicate) {
  return mockState.ops.filter(predicate).length;
}

export function findOp(mockState, predicate) {
  return mockState.ops.find(predicate) || null;
}

export function countSelectColumns(selectExpr) {
  if (!selectExpr || typeof selectExpr !== 'string') return 0;
  let depth = 0;
  let count = 1;
  for (let i = 0; i < selectExpr.length; i += 1) {
    const ch = selectExpr[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) count += 1;
  }
  return count;
}

export async function measureAsync(fn) {
  const started = performance.now();
  const value = await fn();
  return { value, elapsedMs: performance.now() - started };
}
