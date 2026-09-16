import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getAuthToken, removeAuthToken } from './token-storage';
import { useAuthStore } from '../store/auth.store';
import { attachSslAuditInterceptor } from './sslPinning';

// Environment-based API URL resolution:
// - Physical device (Expo Go): Dynamically extracts LAN host IP from Expo manifest (e.g. 192.168.1.6:3001)
// - Android Emulator fallback: 10.0.2.2:3001
// - iOS Simulator / Web: localhost:3001
// - Production: https://api.axon-erp.com
function resolveApiUrl(): string {
  const isDebug = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false;
  if (!isDebug) {
    return 'https://api.axon-erp.com';
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip) {
      return `http://${ip}:3001`;
    }
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  return 'http://localhost:3001';
}

export const API_URL = resolveApiUrl();

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
  },
  timeout: 15000,
});

// Enforce SSL/TLS integrity in production
attachSslAuditInterceptor(apiClient);

// Request Interceptor: Attach Bearer Token if present
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getAuthToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Ignore token read error
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const isLoginAttempt = error.config?.url?.includes('/api/auth/login');
    if (error.response?.status === 401 && !isLoginAttempt) {
      await removeAuthToken();
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);