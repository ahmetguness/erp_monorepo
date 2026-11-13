import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/cross-module/scenarios/**/*.test.ts'],
    setupFiles: ['tests/cross-module/support/environment.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    retry: 0,
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: '../../artifacts/cross-module/results.json',
      junit: '../../artifacts/cross-module/junit.xml',
    },
  },
});
