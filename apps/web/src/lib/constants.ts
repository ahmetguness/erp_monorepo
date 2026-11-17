const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_URL = configuredApiUrl || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
export const API_BASE_URL = API_URL.replace(/\/$/, '');

export function absoluteApiUrl(path: string): string {
  const origin = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin ? new URL(path, origin).href : path;
}
