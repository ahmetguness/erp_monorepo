/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@repo/types'],
  turbopack: {
    root: '../../',
  },
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
