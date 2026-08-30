import axios from 'axios';
import { API_URL } from '@/lib/constants';
import { installApiErrorInterceptor } from '@/lib/http/api-error.interceptor';

export const adminApiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

installApiErrorInterceptor(adminApiClient);
