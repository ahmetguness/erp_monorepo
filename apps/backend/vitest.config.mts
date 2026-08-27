import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: '../../coverage/backend',
      include: [
        'src/modules/shared/application/pagination.ts',
        'src/modules/finance/domain/invoice-status.policy.ts',
        'src/services/financial/status-transition.service.ts',
        'src/modules/inventory/domain/inventory-policy.ts',
        'src/modules/inventory/domain/replenishment-policy.ts',
        'src/modules/workforce-service/domain/service-request-sla.ts',
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
