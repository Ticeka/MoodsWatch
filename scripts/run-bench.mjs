#!/usr/bin/env node
// Friendly entry point for the query-fetch benchmark.
//
// Usage:
//   npm run bench                       # default same-region (30ms / 15 iter)
//   npm run bench:fast                  # CPU only (0ms / 50 iter)
//   npm run bench:slow                  # cross-region (150ms / 10 iter)
//   npm run bench -- --latency=120      # custom latency
//   npm run bench -- --latency=200 --iter=10
//
// Flags:
//   --latency=<ms>   per-roundtrip simulated latency (default 30)
//   --iter=<n>       iterations per scenario          (default 15)
//   --fast           preset: latency=0, iter=50  (measure pure CPU)
//   --slow           preset: latency=150, iter=10 (cross-region)

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const env = { ...process.env };
const args = process.argv.slice(2);

function takeValue(arg, prefix, next) {
  if (arg.startsWith(`${prefix}=`)) return arg.slice(prefix.length + 1);
  if (arg === prefix) return next;
  return null;
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1];

  const latency = takeValue(arg, '--latency', next);
  if (latency != null) {
    env.BENCH_LATENCY_MS = String(latency);
    if (arg === '--latency') i += 1;
    continue;
  }

  const iter = takeValue(arg, '--iter', next);
  if (iter != null) {
    env.BENCH_ITER = String(iter);
    if (arg === '--iter') i += 1;
    continue;
  }

  if (arg === '--fast') {
    env.BENCH_LATENCY_MS = '0';
    env.BENCH_ITER = env.BENCH_ITER ?? '50';
    continue;
  }

  if (arg === '--slow') {
    env.BENCH_LATENCY_MS = '150';
    env.BENCH_ITER = env.BENCH_ITER ?? '10';
    continue;
  }

  if (arg === '--help' || arg === '-h') {
    console.log(`Usage:
  npm run bench                       # default 30ms / 15 iter
  npm run bench:fast                  # CPU only (0ms / 50 iter)
  npm run bench:slow                  # cross-region (150ms / 10 iter)
  npm run bench -- --latency=<ms>     # custom latency
  npm run bench -- --iter=<n>         # custom iterations`);
    process.exit(0);
  }
}

const vitestBin = path.join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
);

const child = spawn(
  vitestBin,
  ['run', '--config', 'vitest.bench.config.js'],
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
