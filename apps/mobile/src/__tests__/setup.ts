import { vi, beforeEach } from 'vitest';

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// ─────────────────────────────────────────────
// 1. In-Memory AsyncStorage Mock
// ─────────────────────────────────────────────
const storageCache = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (key: string, value: string) => {
      storageCache.set(key, value);
    }),
    getItem: vi.fn(async (key: string) => {
      return storageCache.get(key) ?? null;
    }),
    removeItem: vi.fn(async (key: string) => {
      storageCache.delete(key);
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((k) => storageCache.delete(k));
    }),
    clear: vi.fn(async () => {
      storageCache.clear();
    }),
    getAllKeys: vi.fn(async () => {
      return Array.from(storageCache.keys());
    }),
  },
}));

// ─────────────────────────────────────────────
// 2. NetInfo Mock
// ─────────────────────────────────────────────
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => ({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    })),
    addEventListener: vi.fn(() => () => {}),
  },
}));

// ─────────────────────────────────────────────
// 3. Expo Secure Store Mock
// ─────────────────────────────────────────────
const secureStoreCache = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreCache.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => {
    return secureStoreCache.get(key) ?? null;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreCache.delete(key);
  }),
}));

// ─────────────────────────────────────────────
// 4. Expo Constants Mock
// ─────────────────────────────────────────────
vi.mock('expo-constants', () => ({
  default: {
    deviceName: 'iPhone 16 Pro',
    isDevice: true,
    expoConfig: {
      name: 'mobile',
      slug: 'mobile',
      version: '1.0.0',
      extra: {
        eas: {
          projectId: 'axon-erp-mobile',
        },
      },
    },
  },
}));

// ─────────────────────────────────────────────
// 5. Expo Screen Capture Mock
// ─────────────────────────────────────────────
vi.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: vi.fn(async () => {}),
  allowScreenCaptureAsync: vi.fn(async () => {}),
  addScreenshotListener: vi.fn(() => ({ remove: vi.fn() })),
}));

// Global cleanup before each test
beforeEach(() => {
  storageCache.clear();
  secureStoreCache.clear();
  vi.clearAllMocks();
});
