import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@repo/types'],
  turbopack: {
    root: path.resolve(import.meta.dirname, '../..'),
  },
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
