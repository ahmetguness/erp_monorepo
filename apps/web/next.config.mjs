import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack alias (@repo/types)
  turbopack: {
    resolveAlias: {
      '@repo/types': path.resolve(__dirname, '../../packages/types/index.ts'),
    },
  },
};

export default nextConfig;
