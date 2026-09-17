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

// ─────────────────────────────────────────────
// 6. Expo Modules Core Mock
// ─────────────────────────────────────────────
vi.mock('expo-modules-core', () => ({
  EventEmitter: vi.fn(),
  Platform: { OS: 'ios' },
  requireNativeModule: vi.fn(() => ({})),
  NativeModulesProxy: {},
}));

// ─────────────────────────────────────────────
// 7. Expo Haptics Mock
// ─────────────────────────────────────────────
vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  selectionAsync: vi.fn(async () => {}),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Rigid: 'rigid',
    Soft: 'soft',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// ─────────────────────────────────────────────
// 8. Vector Icons Mock
// ─────────────────────────────────────────────
vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
  FontAwesome5: () => null,
}));

// ─────────────────────────────────────────────
// 9. Expo Camera Mock
// ─────────────────────────────────────────────
vi.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: vi.fn(() => [{ granted: true }, vi.fn()]),
}));

// ─────────────────────────────────────────────
// 10. React Native Safe Area Context Mock
// ─────────────────────────────────────────────
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: vi.fn(() => ({ top: 0, right: 0, bottom: 0, left: 0 })),
  SafeAreaView: ({ children }: { children: any }) => children,
  SafeAreaProvider: ({ children }: { children: any }) => children,
  SafeAreaConsumer: ({ children }: { children: any }) =>
    children({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// ─────────────────────────────────────────────
// 11. React Native SVG Mock
// ─────────────────────────────────────────────
vi.mock('react-native-svg', () => {
  const React = require('react');
  const Component = ({ children }: any) => children ?? null;
  return {
    default: Component,
    Svg: Component,
    Path: Component,
    Rect: Component,
    Circle: Component,
    Line: Component,
    Polyline: Component,
    Polygon: Component,
    G: Component,
    Defs: Component,
    LinearGradient: Component,
    Stop: Component,
    ClipPath: Component,
    Text: Component,
  };
});


// Global cleanup before each test
beforeEach(() => {
  storageCache.clear();
  secureStoreCache.clear();
  vi.clearAllMocks();
});


