import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      vitest: path.resolve(rootDir, './test/vitest-globals.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__benchmarks__/**/*.bench.js'],
    testTimeout: 180000,
    hookTimeout: 60000,
    reporters: ['default'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
