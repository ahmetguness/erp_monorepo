import axios from 'axios';
import { API_URL } from '@/lib/constants';

export const adminApiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});
