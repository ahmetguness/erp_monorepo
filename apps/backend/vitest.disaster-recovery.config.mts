import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/disaster-recovery/tests/drill.test.ts"],
    setupFiles: ["apps/backend/tests/cross-module/support/environment.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    retry: 0,
    reporters: ["default", "json"],
    outputFile: {
      json: `artifacts/disaster-recovery/${process.env.DR_OWNER}/vitest.json`,
    },
  },
});
