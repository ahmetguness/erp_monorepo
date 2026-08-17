const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_URL = configuredApiUrl || 'http://localhost:3001';
export const API_BASE_URL = API_URL.replace(/\/$/, '');
