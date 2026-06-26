/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@repo/types'],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
