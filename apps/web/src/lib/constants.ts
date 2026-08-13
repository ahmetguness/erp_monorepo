const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !configuredApiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL must be set for production builds.');
}

export const API_URL = configuredApiUrl ?? 'http://localhost:3001';
export const API_BASE_URL = API_URL.replace(/\/$/, '');

const productionApiHostname = isProduction ? new URL(API_BASE_URL).hostname : '';

if (isProduction && ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(productionApiHostname)) {
  throw new Error('NEXT_PUBLIC_API_URL must not point to a localhost address in production.');
}
