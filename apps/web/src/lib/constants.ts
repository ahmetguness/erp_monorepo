export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const API_BASE_URL = API_URL.replace(/\/$/, '');

declare global {
  var __AXON_API_URL_WARNING_SHOWN__: boolean | undefined;
}

if (process.env.NODE_ENV === 'production' && API_BASE_URL.includes('localhost')) {
  if (!globalThis.__AXON_API_URL_WARNING_SHOWN__) {
    console.warn('[Axon] API_URL is set to localhost. Set NEXT_PUBLIC_API_URL for production.');
    globalThis.__AXON_API_URL_WARNING_SHOWN__ = true;
  }
}
