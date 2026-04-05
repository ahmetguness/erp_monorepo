import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const adminApiClient = axios.create({ baseURL: BASE_URL });

adminApiClient.interceptors.request.use((config) => {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|; )admin-token=([^;]*)/);
    if (match) config.headers.Authorization = `Bearer ${decodeURIComponent(match[1])}`;
  }
  return config;
});
