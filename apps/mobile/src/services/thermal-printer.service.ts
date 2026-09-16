import AsyncStorage from '@react-native-async-storage/async-storage';
import { SalesOrder } from './sales.service';
import { ProductLookup } from './inventory.service';
import { formatCurrency } from '../lib/utils';

// ─────────────────────────────────────────────
// ESC/POS Printer Types & Interfaces
// ─────────────────────────────────────────────

export type PaperWidth = 58 | 80;

export interface PrinterDevice {
  id: string;
  name: string;
  address?: string;
  isConnected: boolean;
  rssi?: number;
  type: 'BLE' | 'CLASSIC' | 'SIMULATOR';
}

export interface PrinterSettings {
  paperWidth: PaperWidth;
  characterSet: 'CP857' | 'UTF8' | 'ASCII';
  autoCut: boolean;
  pairedDevice: PrinterDevice | null;
  copies: number;
}

export interface PaymentReceiptData {
  receiptNumber: string;
  contactName: string;
  date: string;
  amount: number;
  paymentMethod: string;
  remainingBalance?: number;
  notes?: string;
}

export interface ShelfLabelData {
  warehouseName: string;
  code: string;
  name: string;
  aisle?: string | null;
  shelf?: string | null;
}

const STORAGE_KEY = 'axon_printer_settings_v1';

const DEFAULT_SETTINGS: PrinterSettings = {
  paperWidth: 58,
  characterSet: 'CP857',
  autoCut: true,
  pairedDevice: {
    id: 'sim-printer-01',
    name: 'Axon Mobil Termal Yazıcı (58mm)',
    isConnected: true,
    type: 'SIMULATOR',
  },
  copies: 1,
};

// ─────────────────────────────────────────────
// Turkish Character Normalizer (CP857 / Transliteration)
// ─────────────────────────────────────────────

export function normalizeTurkishText(text: string, charset: 'CP857' | 'UTF8' | 'ASCII' = 'ASCII'): string {
  if (charset === 'UTF8') return text;

  // For high-compatibility ESC/POS thermal printers without CP857 code pages installed,
  // high-fidelity ASCII transliteration ensures zero garbage/corrupted characters.
  const map: Record<string, string> = {
    'ğ': 'g', 'Ğ': 'G',
    'ü': 'u', 'Ü': 'U',
    'ş': 's', 'Ş': 'S',
    'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O',
    'ç': 'c', 'Ç': 'C',
    'â': 'a', 'Â': 'A',
    'î': 'i', 'Î': 'I',
  };

  return text.replace(/[ğĞüÜşŞıİöÖçÇâÂîÎ]/g, (char) => map[char] || char);
}

// ─────────────────────────────────────────────
// ESC/POS Command Stream Builder
// ─────────────────────────────────────────────

export class EscPosBuilder {
  private buffer: number[] = [];
  private previewLines: string[] = [];
  private readonly maxChars: number;
  private readonly charset: 'CP857' | 'UTF8' | 'ASCII';

  constructor(paperWidth: PaperWidth = 58, charset: 'CP857' | 'UTF8' | 'ASCII' = 'ASCII') {
    this.maxChars = paperWidth === 58 ? 32 : 48;
    this.charset = charset;
    this.init();
  }

  public init(): this {
    // ESC @: Initialize printer
    this.buffer.push(0x1B, 0x40);
    return this;
  }

  public align(alignment: 'left' | 'center' | 'right'): this {
    // ESC a n: 0=left, 1=center, 2=right
    const n = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1B, 0x61, n);
    return this;
  }

  public bold(enable = true): this {
    // ESC E n: Bold font
    this.buffer.push(0x1B, 0x45, enable ? 1 : 0);
    return this;
  }

  public doubleSize(enable = true): this {
    // GS ! n: 0x11 = Double width & height, 0x00 = Normal
    this.buffer.push(0x1D, 0x21, enable ? 0x11 : 0x00);
    return this;
  }

  public underline(enable = true): this {
    // ESC - n
    this.buffer.push(0x1B, 0x2D, enable ? 1 : 0);
    return this;
  }

  public line(rawText = ''): this {
    const text = normalizeTurkishText(rawText, this.charset);
    const bytes = this.textToBytes(text);
    this.buffer.push(...bytes, 0x0A); // LF
    this.previewLines.push(text);
    return this;
  }

  public divider(char = '-'): this {
    const dividerText = char.repeat(this.maxChars);
    return this.line(dividerText);
  }

  public doubleDivider(): this {
    return this.divider('=');
  }

  public row(leftRaw: string, rightRaw: string): this {
    const left = normalizeTurkishText(leftRaw, this.charset);
    const right = normalizeTurkishText(rightRaw, this.charset);

    const leftLen = left.length;
    const rightLen = right.length;
    const spaceCount = Math.max(1, this.maxChars - leftLen - rightLen);
    const formatted = left + ' '.repeat(spaceCount) + right;

    return this.line(formatted.slice(0, this.maxChars));
  }

  public centerLine(rawText: string, doubleSize = false): this {
    const text = normalizeTurkishText(rawText, this.charset);
    this.align('center');
    if (doubleSize) this.doubleSize(true);
    this.line(text);
    if (doubleSize) this.doubleSize(false);
    this.align('left');
    return this;
  }

  public barcode(code: string): this {
    const clean = code.trim();
    // GS h n: Set barcode height (64 dots)
    this.buffer.push(0x1D, 0x68, 64);
    // GS w n: Barcode width multiplier (2)
    this.buffer.push(0x1D, 0x77, 2);
    // GS H n: Position of HRI characters (2 = below barcode)
    this.buffer.push(0x1D, 0x48, 2);
    // GS k m d1...dk NUL (m = 4 for CODE39 or 73 for CODE128)
    this.buffer.push(0x1D, 0x6B, 4);
    for (let i = 0; i < clean.length; i++) {
      this.buffer.push(clean.charCodeAt(i));
    }
    this.buffer.push(0x00);

    this.previewLines.push(`[BARKOD: ${clean}]`);
    return this;
  }

  public qr(content: string): this {
    const clean = content.trim();
    this.previewLines.push(`[QR KOD: ${clean}]`);
    // ESC/POS QR code standard bytes
    const len = clean.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    // GS ( k: Store data in symbol storage area
    this.buffer.push(0x1D, 0x28, 0x6B, pL, pH, 49, 80, 48);
    for (let i = 0; i < clean.length; i++) {
      this.buffer.push(clean.charCodeAt(i));
    }
    // GS ( k: Print QR code
    this.buffer.push(0x1D, 0x28, 0x6B, 3, 0, 49, 81, 48);
    return this;
  }

  public feed(lines = 3): this {
    // ESC d n: Print and feed n lines
    this.buffer.push(0x1B, 0x64, Math.max(1, lines));
    for (let i = 0; i < lines; i++) {
      this.previewLines.push('');
    }
    return this;
  }

  public cut(): this {
    // GS V m: Cut paper (m=66 partial cut, m=0 full cut)
    this.buffer.push(0x1D, 0x56, 66, 0);
    this.previewLines.push('✂- - - - - - - - - - - - - - - - - - - - - -✂');
    return this;
  }

  public toBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  public toBase64(): string {
    const bytes = this.toBytes();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < len ? bytes[i + 1] : 0;
      const b2 = i + 2 < len ? bytes[i + 2] : 0;

      result += chars[b0 >> 2];
      result += chars[((b0 & 3) << 4) | (b1 >> 4)];
      result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      result += i + 2 < len ? chars[b2 & 63] : '=';
    }
    return result;
  }

  public toMonospacePreview(): string {
    return this.previewLines.join('\n');
  }

  private textToBytes(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes.push(code > 127 ? 63 : code); // 63 is '?' for non-ascii if fallback
    }
    return bytes;
  }
}

// ─────────────────────────────────────────────
// Document Template Engines
// ─────────────────────────────────────────────

/**
 * 15.3.1: Saha Satış Sipariş Bilgi Fişi (Order Receipt)
 */
export function generateOrderReceipt(
  order: SalesOrder,
  companyName = 'AXON ERP BILISIM A.S.',
  paperWidth: PaperWidth = 58
): { preview: string; bytes: Uint8Array } {
  const builder = new EscPosBuilder(paperWidth, 'ASCII');

  builder.align('center');
  builder.bold(true);
  builder.line(companyName);
  builder.bold(false);
  builder.line('SIPARIS BILGI FISI');
  builder.doubleDivider();

  builder.align('left');
  builder.row('Siparis No:', order.number || order.id.slice(0, 10));
  builder.row('Tarih:', new Date(order.date).toLocaleDateString('tr-TR'));
  if (order.contact?.name) {
    builder.line(`Musteri: ${order.contact.name}`);
  }
  builder.divider();

  // Item lines
  builder.row('URUN / ADET', 'TUTAR');
  builder.divider();

  if (order.items && order.items.length > 0) {
    order.items.forEach((item) => {
      const name = item.product?.name || 'Urun';
      const qtyStr = `${item.quantity} Ad x ${formatCurrency(item.unitPrice)}`;
      const totalStr = formatCurrency(item.lineTotal);
      builder.line(name);
      builder.row(` ${qtyStr}`, totalStr);
    });
  }

  builder.divider();
  builder.row('Ara Toplam:', formatCurrency(order.totalNet));
  builder.row('KDV Tutari:', formatCurrency(order.totalTax));
  builder.bold(true);
  builder.row('GENEL TOPLAM:', formatCurrency(order.totalGross));
  builder.bold(false);
  builder.doubleDivider();

  builder.align('center');
  builder.line('Bu belge bilgi amaclidir.');
  builder.line('Mali degeri yoktur.');
  builder.feed(2);
  builder.cut();

  return {
    preview: builder.toMonospacePreview(),
    bytes: builder.toBytes(),
  };
}

/**
 * 15.3.2: Saha Satış Tahsilat Makbuzu (Payment Receipt)
 */
export function generatePaymentReceipt(
  data: PaymentReceiptData,
  companyName = 'AXON ERP BILISIM A.S.',
  paperWidth: PaperWidth = 58
): { preview: string; bytes: Uint8Array } {
  const builder = new EscPosBuilder(paperWidth, 'ASCII');

  builder.align('center');
  builder.bold(true);
  builder.line(companyName);
  builder.bold(false);
  builder.line('TAHSILAT MAKBUZU');
  builder.doubleDivider();

  builder.align('left');
  builder.row('Makbuz No:', data.receiptNumber);
  builder.row('Tarih:', data.date);
  builder.line(`Cari: ${data.contactName}`);
  builder.divider();

  builder.row('Odeme Sekli:', data.paymentMethod);
  builder.bold(true);
  builder.row('TAHSIL EDILEN:', formatCurrency(data.amount));
  builder.bold(false);

  if (data.remainingBalance !== undefined) {
    builder.row('Guncel Bakiye:', formatCurrency(data.remainingBalance));
  }

  if (data.notes) {
    builder.divider();
    builder.line(`Not: ${data.notes}`);
  }

  builder.doubleDivider();
  builder.feed(1);
  builder.align('center');
  builder.line('TESLIM EDEN       TESLIM ALAN');
  builder.line(' (Imza)              (Imza)   ');
  builder.feed(2);
  builder.cut();

  return {
    preview: builder.toMonospacePreview(),
    bytes: builder.toBytes(),
  };
}

/**
 * 15.3.3: Depo Ürün Barkod Etiketi (Product Barcode Label)
 */
export function generateProductLabel(
  product: ProductLookup,
  paperWidth: PaperWidth = 58
): { preview: string; bytes: Uint8Array } {
  const builder = new EscPosBuilder(paperWidth, 'ASCII');

  builder.align('center');
  builder.bold(true);
  builder.line(product.name);
  builder.bold(false);
  builder.line(`KOD: ${product.code}`);
  builder.divider();

  const barcodeValue = product.barcode || product.code;
  builder.barcode(barcodeValue);
  builder.line(barcodeValue);
  builder.divider();

  builder.bold(true);
  builder.line(`FIYAT: ${formatCurrency(product.salesPrice)} + KDV`);
  builder.bold(false);
  builder.feed(2);
  builder.cut();

  return {
    preview: builder.toMonospacePreview(),
    bytes: builder.toBytes(),
  };
}

/**
 * 15.3.4: Depo Raf & Lokasyon Etiketi (Shelf Location Label)
 */
export function generateShelfLabel(
  data: ShelfLabelData,
  paperWidth: PaperWidth = 58
): { preview: string; bytes: Uint8Array } {
  const builder = new EscPosBuilder(paperWidth, 'ASCII');

  builder.align('center');
  builder.line(`DEPO: ${data.warehouseName}`);
  builder.doubleDivider();

  builder.bold(true);
  builder.centerLine(data.code, true); // Big font
  builder.bold(false);
  builder.line(data.name);

  if (data.aisle || data.shelf) {
    const locMeta = [
      data.aisle ? `Koridor: ${data.aisle}` : null,
      data.shelf ? `Raf: ${data.shelf}` : null,
    ].filter(Boolean).join(' | ');
    builder.line(locMeta);
  }

  builder.divider();
  builder.qr(`AXON-LOC:${data.code}`);
  builder.line(`[ LOKASYON QR ]`);
  builder.feed(2);
  builder.cut();

  return {
    preview: builder.toMonospacePreview(),
    bytes: builder.toBytes(),
  };
}

// ─────────────────────────────────────────────
// Thermal Printer Service (Settings & Dispatcher)
// ─────────────────────────────────────────────

class ThermalPrinterService {
  private settings: PrinterSettings = DEFAULT_SETTINGS;
  private isLoaded = false;

  public async getSettings(): Promise<PrinterSettings> {
    if (!this.isLoaded) {
      await this.loadSettings();
    }
    return this.settings;
  }

  public async updateSettings(newSettings: Partial<PrinterSettings>): Promise<PrinterSettings> {
    this.settings = { ...this.settings, ...newSettings };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Non-fatal
    }
    return this.settings;
  }

  public async discoverDevices(): Promise<PrinterDevice[]> {
    // Simulated discovery of nearby Bluetooth / BLE POS thermal printers
    return [
      {
        id: 'sim-printer-01',
        name: 'Axon Mini Termal (58mm BT)',
        address: '88:4A:EA:12:34:56',
        isConnected: this.settings.pairedDevice?.id === 'sim-printer-01',
        rssi: -45,
        type: 'SIMULATOR',
      },
      {
        id: 'pos-5802dd',
        name: 'POS-5802DD Kemer Yazıcı',
        address: '00:11:22:33:44:55',
        isConnected: this.settings.pairedDevice?.id === 'pos-5802dd',
        rssi: -62,
        type: 'BLE',
      },
      {
        id: 'xprinter-xp58',
        name: 'Xprinter XP-58IIH',
        address: 'AA:BB:CC:DD:EE:FF',
        isConnected: this.settings.pairedDevice?.id === 'xprinter-xp58',
        rssi: -70,
        type: 'BLE',
      },
      {
        id: 'zebra-zq320',
        name: 'Zebra ZQ320 Mobil Etiket',
        address: '12:34:56:78:9A:BC',
        isConnected: this.settings.pairedDevice?.id === 'zebra-zq320',
        rssi: -55,
        type: 'BLE',
      },
    ];
  }

  public async pairDevice(device: PrinterDevice): Promise<boolean> {
    const paired: PrinterDevice = { ...device, isConnected: true };
    await this.updateSettings({ pairedDevice: paired });
    return true;
  }

  public async disconnectDevice(): Promise<boolean> {
    await this.updateSettings({ pairedDevice: null });
    return true;
  }

  public async print(bytes: Uint8Array, jobName = 'Termal Baskı'): Promise<{ success: boolean; message: string }> {
    const settings = await this.getSettings();
    if (!settings.pairedDevice) {
      return {
        success: false,
        message: 'Eşleşmiş Bluetooth yazıcı bulunamadı. Lütfen yazıcı ayarlarından bir cihaz seçin.',
      };
    }

    // In Expo managed workflow, we simulate sending raw ESC/POS byte array to BLE serial characteristic
    // or Web Bluetooth stream, while providing feedback.
    return {
      success: true,
      message: `"${jobName}" (${bytes.length} bayt) başarıyla ${settings.pairedDevice.name} yazıcısına iletildi.`,
    };
  }

  private async loadSettings(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    } finally {
      this.isLoaded = true;
    }
  }
}

export const thermalPrinterService = new ThermalPrinterService();
