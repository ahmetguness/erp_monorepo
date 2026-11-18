import { defineConfig } from 'vitest/config';

const reportDirectory = process.env.CROSS_MODULE_REPORT_DIRECTORY ?? '../../artifacts/cross-module';
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
      json: `${reportDirectory}/results.json`,
      junit: `${reportDirectory}/junit.xml`,
    },
  },
});
