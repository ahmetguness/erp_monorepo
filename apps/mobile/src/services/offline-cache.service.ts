import AsyncStorage from '@react-native-async-storage/async-storage';
import { getContacts, Contact } from './contact.service';
import { getProducts, getAllStockLevels, ProductLookup, StockLevel } from './inventory.service';

// ─────────────────────────────────────────────
// Storage Keys & Constants
// ─────────────────────────────────────────────

const CACHE_KEY_CONTACTS = '@axon_offline_cache_contacts_v1';
const CACHE_KEY_PRODUCTS = '@axon_offline_cache_products_v1';
const CACHE_KEY_STOCK_LEVELS = '@axon_offline_cache_stock_v1';
const CACHE_KEY_META = '@axon_offline_cache_meta_v1';

const DEFAULT_TTL_HOURS = 12;

export interface CacheMetadata {
  lastSyncAt: string | null;
  contactsCount: number;
  productsCount: number;
  stockCount: number;
}

interface CacheWrapper<T> {
  data: T;
  cachedAt: number; // unix timestamp
  ttlHours: number;
}

// ─────────────────────────────────────────────
// Generic Cache Helpers
// ─────────────────────────────────────────────

async function setCacheItem<T>(key: string, data: T, ttlHours = DEFAULT_TTL_HOURS): Promise<void> {
  try {
    const payload: CacheWrapper<T> = {
      data,
      cachedAt: Date.now(),
      ttlHours,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn(`[OfflineCache] Failed to save ${key}:`, err);
  }
}

async function getCacheItem<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const wrapper: CacheWrapper<T> = JSON.parse(raw);
    return wrapper.data;
  } catch (err) {
    console.warn(`[OfflineCache] Failed to read ${key}:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────
// Master Data Cache Functions (10.1)
// ─────────────────────────────────────────────

export async function cacheContacts(contacts: Contact[]): Promise<void> {
  await setCacheItem(CACHE_KEY_CONTACTS, contacts);
}

export async function getCachedContacts(): Promise<Contact[]> {
  const cached = await getCacheItem<Contact[]>(CACHE_KEY_CONTACTS);
  return cached ?? [];
}

export async function cacheProducts(products: ProductLookup[]): Promise<void> {
  await setCacheItem(CACHE_KEY_PRODUCTS, products);
}

export async function getCachedProducts(): Promise<ProductLookup[]> {
  const cached = await getCacheItem<ProductLookup[]>(CACHE_KEY_PRODUCTS);
  return cached ?? [];
}

export async function cacheStockLevels(stockLevels: StockLevel[]): Promise<void> {
  await setCacheItem(CACHE_KEY_STOCK_LEVELS, stockLevels);
}

export async function getCachedStockLevels(): Promise<StockLevel[]> {
  const cached = await getCacheItem<StockLevel[]>(CACHE_KEY_STOCK_LEVELS);
  return cached ?? [];
}

export async function getCacheMetadata(): Promise<CacheMetadata> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY_META);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[OfflineCache] Failed to get metadata:', err);
  }

  return {
    lastSyncAt: null,
    contactsCount: 0,
    productsCount: 0,
    stockCount: 0,
  };
}

/**
 * Downloads and caches all essential master data (customers, products, stock levels)
 * for seamless offline usage in warehouse and field trips.
 */
export async function syncAllMasterData(): Promise<CacheMetadata> {
  try {
    const [contactsRes, productsRes, stockRes] = await Promise.all([
      getContacts({ limit: 200 }).catch(() => ({ items: [], total: 0 })),
      getProducts({ limit: 500 }).catch(() => []),
      getAllStockLevels({ limit: 500 }).catch(() => []),
    ]);

    await Promise.all([
      cacheContacts(contactsRes.items),
      cacheProducts(productsRes),
      cacheStockLevels(stockRes),
    ]);

    const meta: CacheMetadata = {
      lastSyncAt: new Date().toISOString(),
      contactsCount: contactsRes.items.length,
      productsCount: productsRes.length,
      stockCount: stockRes.length,
    };

    await AsyncStorage.setItem(CACHE_KEY_META, JSON.stringify(meta));
    return meta;
  } catch (err) {
    console.warn('[OfflineCache] Error during syncAllMasterData:', err);
    throw err;
  }
}

export async function clearMasterDataCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      CACHE_KEY_CONTACTS,
      CACHE_KEY_PRODUCTS,
      CACHE_KEY_STOCK_LEVELS,
      CACHE_KEY_META,
    ]);
  } catch (err) {
    console.warn('[OfflineCache] Error clearing cache:', err);
  }
}
