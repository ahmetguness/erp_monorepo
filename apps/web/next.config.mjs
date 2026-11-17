import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  deploymentId: process.env.RELEASE_GIT_SHA,
  transpilePackages: ['@repo/types'],
  turbopack: {
    root: path.resolve(import.meta.dirname, '../..'),
  },
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
