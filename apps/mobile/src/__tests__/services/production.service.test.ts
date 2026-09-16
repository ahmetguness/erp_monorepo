import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../../lib/api-client';
import {
  reportWorkOrderProduction,
  addWorkOrderItem,
  RecordProductionOutputDTO,
} from '../../services/production.service';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('production.service (FAZ 16 Advanced Production & QC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enrich production output report with lotNumber, serialNumber, downtime and QC traceability', async () => {
    const mockPost = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, data: { id: 'wo-1', producedQty: 25 } },
    } as any);

    const payload: RecordProductionOutputDTO = {
      producedQty: 25,
      scrapQty: 2,
      scrapReason: 'Ölçü Toleransı Dışı',
      notes: 'Gündüz vardiyası',
      lotNumber: 'LOT-2026-0916',
      serialNumber: 'SN-00192',
      downtimeSeconds: 180,
      downtimeReason: 'Mekanik Arıza',
      qcInspection: {
        visualPassed: true,
        dimensionTarget: 50.0,
        dimensionMeasured: 50.04,
        dimensionPassed: true,
        functionalPassed: true,
      },
      consumptions: [
        {
          itemId: 'item-1',
          quantity: 25,
          lotNumber: 'LOT-RAW-88',
        },
      ],
    };

    const res = await reportWorkOrderProduction('wo-1', payload);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [endpoint, sentPayload] = mockPost.mock.calls[0] as [string, any];

    expect(endpoint).toBe('/api/production/work-orders/wo-1/report');
    expect(sentPayload.producedQty).toBe(25);
    expect(sentPayload.scrapQty).toBe(2);
    expect(sentPayload.scrapReason).toBe('Ölçü Toleransı Dışı');

    // Notes must contain enriched traceability strings
    expect(sentPayload.notes).toContain('Gündüz vardiyası');
    expect(sentPayload.notes).toContain('Parti/Lot: LOT-2026-0916');
    expect(sentPayload.notes).toContain('Seri No: SN-00192');
    expect(sentPayload.notes).toContain('Duruş: 180 sn (Mekanik Arıza)');
    expect(sentPayload.notes).toContain('QC: Görsel OK, Tolerans OK');

    // Consumptions must pass lot numbers
    expect(sentPayload.consumptions).toEqual([
      {
        itemId: 'item-1',
        quantity: 25,
        lotNumber: 'LOT-RAW-88',
        serialNumber: undefined,
      },
    ]);

    expect(res).toEqual({ id: 'wo-1', producedQty: 25 });
  });

  it('should call addWorkOrderItem with correct endpoint and payload', async () => {
    const mockPost = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'wo-item-99',
          workOrderId: 'wo-1',
          productId: 'prod-extra-1',
          requiredQty: 5,
          consumedQty: 0,
          product: {
            id: 'prod-extra-1',
            code: 'EXTRA-BOLT',
            name: 'M6 Çelik Civata',
          },
        },
      },
    } as any);

    const result = await addWorkOrderItem('wo-1', {
      productId: 'prod-extra-1',
      requiredQty: 5,
    });

    expect(mockPost).toHaveBeenCalledWith('/api/production/work-orders/wo-1/items', {
      productId: 'prod-extra-1',
      requiredQty: 5,
    });

    expect(result.id).toBe('wo-item-99');
    expect(result.product?.code).toBe('EXTRA-BOLT');
    expect(result.requiredQty).toBe(5);
  });
});
