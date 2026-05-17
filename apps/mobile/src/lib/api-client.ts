import axios, { AxiosError } from 'axios';
import { Platform } from 'react-native';

// Use 10.0.2.2 for Android Emulator, localhost for iOS Simulator/Web
// Fallback to a valid string to prevent crashing
export const API_URL = __DEV__ 
  ? (Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001')
  : 'https://api.axon-erp.com';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Enables cookie handling
  headers: {
    'Content-Type': 'application/json',
    // Backend CSRF korumasını geçmek için mobil cihazlarda manuel Origin belirtmeliyiz.
    // Backend varsayılan olarak http://localhost:3000'e izin veriyor.
    'Origin': 'http://localhost:3000',
  },
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // If a 401 occurs, we should ideally log out the user from Zustand store
    // This will be handled in the component/store or by exporting a generic interceptor logic
    return Promise.reject(error);
  }
);
