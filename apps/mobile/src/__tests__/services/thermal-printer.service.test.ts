import { describe, it, expect } from 'vitest';
import {
  EscPosBuilder,
  normalizeTurkishText,
  generateOrderReceipt,
  generatePaymentReceipt,
  generateProductLabel,
  generateShelfLabel,
  thermalPrinterService,
} from '../../services/thermal-printer.service';
import { SalesOrder } from '../../services/sales.service';

describe('thermal-printer.service - ESC/POS Engine & Templates', () => {
  describe('Turkish Character Normalization', () => {
    it('should correctly transliterate Turkish characters to ASCII', () => {
      const input = 'Şık Çağlayan Ördek Üzüm Ispanak';
      const output = normalizeTurkishText(input, 'ASCII');
      expect(output).toBe('Sik Caglayan Ordek Uzum Ispanak');
    });

    it('should preserve ASCII characters unmodified', () => {
      const input = 'AXON ERP 2026';
      expect(normalizeTurkishText(input, 'ASCII')).toBe('AXON ERP 2026');
    });

    it('should leave text unchanged when charset is UTF8', () => {
      const input = 'Örnek Şirket';
      expect(normalizeTurkishText(input, 'UTF8')).toBe('Örnek Şirket');
    });
  });

  describe('EscPosBuilder Formatting', () => {
    it('should format rows to exactly 32 columns in 58mm mode', () => {
      const builder = new EscPosBuilder(58, 'ASCII');
      builder.row('Sol Metin', 'Sag Metin');
      const lines = builder.toMonospacePreview().split('\n');
      expect(lines[0].length).toBe(32);
      expect(lines[0].startsWith('Sol Metin')).toBe(true);
      expect(lines[0].endsWith('Sag Metin')).toBe(true);
    });

    it('should format rows to exactly 48 columns in 80mm mode', () => {
      const builder = new EscPosBuilder(80, 'ASCII');
      builder.row('Sol Metin', 'Sag Metin');
      const lines = builder.toMonospacePreview().split('\n');
      expect(lines[0].length).toBe(48);
    });

    it('should generate valid byte array and base64 string', () => {
      const builder = new EscPosBuilder(58, 'ASCII');
      builder.centerLine('TEST BASLIK');
      builder.divider('-');
      builder.row('Ara Toplam', '100,00 TL');
      builder.cut();

      const bytes = builder.toBytes();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      const b64 = builder.toBase64();
      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);
    });
  });

  describe('Receipt & Label Templates', () => {
    it('should generate a valid sales order receipt', () => {
      const mockOrder: SalesOrder = {
        id: 'ord-12345',
        number: 'SIP-2026-001',
        contactId: 'cnt-1',
        date: '2026-09-16T12:00:00Z',
        status: 'CONFIRMED',
        totalNet: 1000,
        totalTax: 200,
        totalGross: 1200,
        contact: { id: 'cnt-1', name: 'Ahmet Ticaret' },
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 500,
            discount: 0,
            taxRate: 20,
            taxAmount: 200,
            lineTotal: 1000,
            product: { id: 'prod-1', code: 'PRD-01', name: 'Test Ürünü' },
          },
        ],
      };

      const { preview, bytes } = generateOrderReceipt(mockOrder, 'TEST SIRKETI', 58);
      expect(bytes.length).toBeGreaterThan(50);
      expect(preview).toContain('SIPARIS BILGI FISI');
      expect(preview).toContain('Ahmet Ticaret');
      expect(preview).toContain('GENEL TOPLAM:');
    });

    it('should generate a valid payment receipt', () => {
      const { preview, bytes } = generatePaymentReceipt({
        receiptNumber: 'TAH-001',
        contactName: 'Mehmet Ltd.',
        date: '16.09.2026',
        amount: 3500,
        paymentMethod: 'Nakit',
        remainingBalance: 500,
      });

      expect(bytes.length).toBeGreaterThan(30);
      expect(preview).toContain('TAHSILAT MAKBUZU');
      expect(preview).toContain('Mehmet Ltd.');
      expect(preview).toContain('TAHSIL EDILEN:');
    });

    it('should generate a product barcode label', () => {
      const { preview, bytes } = generateProductLabel({
        id: 'p-1',
        code: 'SKU-999',
        name: 'Kablosuz Barkod Okuyucu',
        barcode: '8690001122334',
        salesPrice: 750,
        purchasePrice: 400,
        minStockLevel: 5,
        isActive: true,
      });

      expect(bytes.length).toBeGreaterThan(20);
      expect(preview).toContain('Kablosuz Barkod Okuyucu');
      expect(preview).toContain('8690001122334');
    });

    it('should generate a shelf location label with QR placeholder', () => {
      const { preview, bytes } = generateShelfLabel({
        warehouseName: 'Ana Depo',
        code: 'A-01-02',
        name: 'Koridor A / Raf 2',
        aisle: 'A',
        shelf: '2',
      });

      expect(bytes.length).toBeGreaterThan(20);
      expect(preview).toContain('A-01-02');
      expect(preview).toContain('LOKASYON QR');
    });
  });

  describe('ThermalPrinterService Settings', () => {
    it('should return default settings and discover devices', async () => {
      const settings = await thermalPrinterService.getSettings();
      expect(settings.paperWidth).toBe(58);
      expect(settings.autoCut).toBe(true);

      const devices = await thermalPrinterService.discoverDevices();
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].type).toBe('SIMULATOR');
    });

    it('should allow pairing and updating settings', async () => {
      const devices = await thermalPrinterService.discoverDevices();
      await thermalPrinterService.pairDevice(devices[0]);
      const updated = await thermalPrinterService.updateSettings({ paperWidth: 80 });
      expect(updated.paperWidth).toBe(80);

      const printResult = await thermalPrinterService.print(new Uint8Array([0x1B, 0x40]), 'Test Job');
      expect(printResult.success).toBe(true);
    });
  });
});
