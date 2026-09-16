import { describe, it, expect } from 'vitest';
import {
  cacheContacts,
  getCachedContacts,
  cacheProducts,
  getCachedProducts,
  cacheStockLevels,
  getCachedStockLevels,
  getCacheMetadata,
  clearMasterDataCache,
} from '../../services/offline-cache.service';
import type { Contact } from '../../services/contact.service';
import type { ProductLookup, StockLevel } from '../../services/inventory.service';

describe('offline-cache.service Master Data Persistence', () => {
  it('should cache and retrieve customer contacts', async () => {
    const mockContacts: Contact[] = [
      {
        id: 'c_1',
        name: 'Atlas Makine Sanayi',
        type: 'CUSTOMER',
        phone: '+90 532 111 2233',
        email: 'info@atlas.com',
        isActive: true,
      },
    ];

    await cacheContacts(mockContacts);
    const retrieved = await getCachedContacts();

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].name).toBe('Atlas Makine Sanayi');
  });

  it('should cache and retrieve products', async () => {
    const mockProducts: ProductLookup[] = [
      {
        id: 'p_1',
        code: 'PRD-101',
        name: 'Paslanmaz Çelik Rulman',
        barcode: '8690123456789',
        salesPrice: 350,
        purchasePrice: 200,
        minStockLevel: 10,
        isActive: true,
        unit: { id: 'u1', name: 'Adet', code: 'AD' },
        taxRate: { id: 't1', name: 'KDV20', rate: 20 },
      },
    ];

    await cacheProducts(mockProducts);
    const retrieved = await getCachedProducts();

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].barcode).toBe('8690123456789');
  });

  it('should cache and retrieve stock levels', async () => {
    const mockStock: StockLevel[] = [
      {
        id: 'sl_1',
        productId: 'p_1',
        warehouseId: 'wh_main',
        warehouse: { id: 'wh_main', name: 'Merkez Depo' },
        quantity: 150,
        reservedQuantity: 30,
        availableQuantity: 120,
      },
    ];

    await cacheStockLevels(mockStock);
    const retrieved = await getCachedStockLevels();

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].availableQuantity).toBe(120);
  });

  it('should clear all master data cache', async () => {
    await cacheContacts([{ id: 'c1', name: 'Test', type: 'CUSTOMER', isActive: true }]);
    await cacheProducts([
      {
        id: 'p1',
        code: 'P1',
        name: 'P1',
        barcode: '1',
        salesPrice: 10,
        purchasePrice: 5,
        minStockLevel: 0,
        isActive: true,
        unit: { id: 'u1', name: 'Adet', code: 'AD' },
        taxRate: { id: 't1', name: 'KDV20', rate: 20 },
      },
    ]);

    await clearMasterDataCache();

    const contacts = await getCachedContacts();
    const products = await getCachedProducts();

    expect(contacts).toHaveLength(0);
    expect(products).toHaveLength(0);
  });

  it('should return default empty metadata when no sync has been run', async () => {
    const meta = await getCacheMetadata();
    expect(meta.contactsCount).toBe(0);
    expect(meta.productsCount).toBe(0);
    expect(meta.lastSyncAt).toBeNull();
  });
});
