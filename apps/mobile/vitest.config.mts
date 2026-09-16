import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'react-native': path.resolve(import.meta.dirname, 'src/__tests__/mocks/react-native.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    globals: true,
  },
});
