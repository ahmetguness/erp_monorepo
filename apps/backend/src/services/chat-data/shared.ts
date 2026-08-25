import { prisma } from '../../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus, Prisma, PurchaseRequestStatus } from '@prisma/client';
import { generateDocumentNumber } from '../../utils/generate-number.js';

export interface LowStockPurchaseAdjustment {
  productCode: string;
  quantity: number;
}

export interface LowStockPurchaseRequestOptions {
  limit?: number;
  note?: string;
  confirmed?: boolean;
  adjustments?: LowStockPurchaseAdjustment[];
}

/**
 * Chatbot'un ERP verilerine erişimi için servis katmanı.
 * Doğrudan Prisma kullanarak ERP verilerine erişir.
 *
 * Kurallar:
 * - tenantId her zaman parametre olarak alınır (JWT'den gelir)
 * - Sadece okuma işlemleri
 * - Yanıtlar sınırlı (max 50 kayıt) — AI context window koruması
 */


// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

export function getCurrentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthStartDate(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function groupByDepartment(payrolls: Array<{ grossSalary: Prisma.Decimal | number; netSalary: Prisma.Decimal | number; employee: { department: string | null } }>) {
  const map: Record<string, { count: number; totalGross: number; totalNet: number }> = {};
  for (const p of payrolls) {
    const dept = p.employee.department ?? 'Belirtilmemiş';
    if (!map[dept]) map[dept] = { count: 0, totalGross: 0, totalNet: 0 };
    map[dept].count++;
    map[dept].totalGross += Number(p.grossSalary);
    map[dept].totalNet += Number(p.netSalary);
  }
  return Object.entries(map).map(([name, data]) => ({ name, ...data }));
}
