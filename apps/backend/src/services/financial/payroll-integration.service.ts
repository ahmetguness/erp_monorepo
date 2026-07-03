import { AccountType, FiscalPeriodStatus, JournalEntryType, Priority, TaskStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../errors/index.js';
import { resolveOpenFiscalPeriodId } from './period-guard.js';
import { generateDocumentNumber } from '../../utils/generate-number.js';

function getMockIban(employeeId: string): string {
  // Deterministic mock IBAN generation based on employeeId
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) {
    hash = employeeId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const positiveHash = Math.abs(hash).toString().padEnd(16, '0');
  const digits = positiveHash.slice(0, 16);
  return `TR34000620000000${digits}`;
}

export interface BankPaymentFileResult {
  filename: string;
  content: string;
  mimeType: string;
}

export interface ClosingCheckItem {
  name: string;
  passed: boolean;
  message: string;
}

export interface PeriodClosingChecksResult {
  success: boolean;
  checks: ClosingCheckItem[];
}

export async function generateBankPaymentFile(
  db: PrismaClient,
  tenantId: string,
  period: string,
): Promise<BankPaymentFileResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new ValidationError('Dönem formatı YYYY-MM olmalıdır.');
  }

  const payrolls = await db.payroll.findMany({
    where: { tenantId, period, deletedAt: null },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: { employee: { lastName: 'asc' } },
  });

  if (payrolls.length === 0) {
    throw new ValidationError(`Seçilen dönemde (${period}) herhangi bir bordro kaydı bulunmamaktadır.`);
  }

  const csvRows: string[] = [];
  // CSV header
  csvRows.push('Sira No,Personel ID,Ad Soyad,Donem,Net Odeme,Doviz,Banka IBAN (Simule),Aciklama');

  payrolls.forEach((payroll, index) => {
    const fullName = `${payroll.employee.firstName} ${payroll.employee.lastName}`.replace(/,/g, ' ');
    const iban = getMockIban(payroll.employee.id);
    const netSalary = Number(payroll.netSalary).toFixed(2);
    const description = `${period} Maas Odemesi - ${fullName}`;
    csvRows.push(
      `${index + 1},${payroll.employee.id},${fullName},${payroll.period},${netSalary},TRY,${iban},"${description}"`,
    );
  });

  const content = '\uFEFF' + csvRows.join('\r\n'); // UTF-8 BOM to display Turkish characters correctly in Excel
  return {
    filename: `banka_odeme_listesi_${period}.csv`,
    content,
    mimeType: 'text/csv;charset=utf-8',
  };
}

export async function createPayrollAccountingVoucher(
  db: PrismaClient,
  tenantId: string,
  period: string,
  userId: string | null | undefined,
): Promise<{ id: string; number: string; totalGross: number; totalNet: number; totalDeductions: number }> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new ValidationError('Dönem formatı YYYY-MM olmalıdır.');
  }

  const payrolls = await db.payroll.findMany({
    where: { tenantId, period, deletedAt: null },
    select: {
      grossSalary: true,
      deductions: true,
      netSalary: true,
    },
  });

  if (payrolls.length === 0) {
    throw new ValidationError(`Seçilen dönemde (${period}) herhangi bir bordro kaydı bulunmamaktadır.`);
  }

  // Check if journal entry already exists for this period
  const existingVoucher = await db.journalEntry.findFirst({
    where: {
      tenantId,
      refType: 'payroll',
      refId: period,
    },
    select: { id: true, number: true },
  });

  if (existingVoucher) {
    throw new ValidationError(
      `Bu dönem için (${period}) zaten muhasebe fişi oluşturulmuş durumda (${existingVoucher.number}).`,
    );
  }

  const totalGross = payrolls.reduce((sum, p) => sum + Number(p.grossSalary), 0);
  const totalNet = payrolls.reduce((sum, p) => sum + Number(p.netSalary), 0);
  const totalDeductions = payrolls.reduce((sum, p) => sum + Number(p.deductions), 0);

  // Validate values
  if (Math.abs(totalGross - (totalNet + totalDeductions)) > 0.01) {
    throw new ValidationError('Bordro toplamları tutarsız: Brüt, Net ve Kesintiler toplamına eşit olmalıdır.');
  }

  // Ensure accounts exist (provision if missing)
  const requiredCodes = ['770', '335', '360'];
  const accounts = await db.ledgerAccount.findMany({
    where: { tenantId, code: { in: requiredCodes }, deletedAt: null },
    select: { id: true, code: true },
  });

  const accountMap = new Map(accounts.map((a) => [a.code, a.id]));

  // Auto provision accounts if they are missing
  for (const code of requiredCodes) {
    if (!accountMap.has(code)) {
      let name = '';
      let type: AccountType = AccountType.LIABILITY;

      if (code === '770') {
        name = 'Genel Yönetim Giderleri';
        type = AccountType.EXPENSE;
      } else if (code === '335') {
        name = 'Personele Borçlar';
        type = AccountType.LIABILITY;
      } else if (code === '360') {
        name = 'Ödenecek Vergi ve Fonlar';
        type = AccountType.LIABILITY;
      }

      const newAccount = await db.ledgerAccount.create({
        data: {
          tenantId,
          code,
          name,
          accountType: type,
          isActive: true,
        },
        select: { id: true, code: true },
      });
      accountMap.set(code, newAccount.id);
    }
  }

  // Create Journal Entry
  const [year, month] = period.split('-').map((n) => Number.parseInt(n, 10));
  const entryDate = new Date(Date.UTC(year, month, 0)); // last day of that month

  const fiscalPeriodId = await resolveOpenFiscalPeriodId(db, tenantId, entryDate, 'Bordro muhasebe fişi');
  if (!fiscalPeriodId) {
    throw new ValidationError('Bordro dönemi için açık bir mali dönem bulunamadı.');
  }

  const number = await generateDocumentNumber(tenantId, 'journal', 'JE-', 'journalEntry');

  const linesData = [
    {
      tenantId,
      accountId: accountMap.get('770')!,
      debit: totalGross,
      credit: 0,
      description: `${period} Dönemi Personel Brüt Maaş Gideri`,
      sortOrder: 0,
    },
    {
      tenantId,
      accountId: accountMap.get('335')!,
      debit: 0,
      credit: totalNet,
      description: `${period} Dönemi Personel Net Maaş Alacağı`,
      sortOrder: 1,
    },
  ];

  if (totalDeductions > 0) {
    linesData.push({
      tenantId,
      accountId: accountMap.get('360')!,
      debit: 0,
      credit: totalDeductions,
      description: `${period} Dönemi Yasal Kesintiler ve Vergiler`,
      sortOrder: 2,
    });
  }

  const journalEntry = await db.journalEntry.create({
    data: {
      tenantId,
      fiscalPeriodId,
      type: JournalEntryType.AUTO_PAYROLL,
      number,
      date: entryDate,
      description: `${period} Dönemi Bordro Tahakkuk Fişi (Otomatik)`,
      refType: 'payroll',
      refId: period,
      isPosted: true,
      postedAt: entryDate,
      createdById: userId,
      lines: {
        create: linesData,
      },
    },
    select: { id: true, number: true },
  });

  return {
    id: journalEntry.id,
    number: journalEntry.number,
    totalGross,
    totalNet,
    totalDeductions,
  };
}

export async function runPeriodClosingChecks(
  db: PrismaClient,
  tenantId: string,
  period: string,
): Promise<PeriodClosingChecksResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new ValidationError('Dönem formatı YYYY-MM olmalıdır.');
  }

  const checks: ClosingCheckItem[] = [];

  // Check 1: Active employees without a payroll in this period
  const [activeEmployees, payrolls] = await Promise.all([
    db.employee.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.payroll.findMany({
      where: { tenantId, period, deletedAt: null },
      select: { employeeId: true, netSalary: true },
    }),
  ]);

  const payrollEmployeeIds = new Set(payrolls.map((p) => p.employeeId));
  const missingEmployees = activeEmployees.filter((e) => !payrollEmployeeIds.has(e.id));

  if (missingEmployees.length > 0) {
    const list = missingEmployees.map((e) => `${e.firstName} ${e.lastName}`).slice(0, 3).join(', ') +
      (missingEmployees.length > 3 ? ` ve diğer ${missingEmployees.length - 3} kişi` : '');
    checks.push({
      name: 'Personel Bordro Kontrolü',
      passed: false,
      message: `Aktif ${missingEmployees.length} personelin bu dönem için bordrosu eksik: ${list}`,
    });
  } else {
    checks.push({
      name: 'Personel Bordro Kontrolü',
      passed: true,
      message: 'Aktif tüm personeller için bordro düzenlenmiş.',
    });
  }

  // Check 2: Salaries with zero/negative values
  const invalidSalaries = payrolls.filter((p) => Number(p.netSalary) <= 0);
  if (invalidSalaries.length > 0) {
    checks.push({
      name: 'Maaş Tutarları Kontrolü',
      passed: false,
      message: `${invalidSalaries.length} adet bordroda net maaş 0 veya negatif hesaplanmış.`,
    });
  } else {
    checks.push({
      name: 'Maaş Tutarları Kontrolü',
      passed: true,
      message: 'Tüm bordroların net maaş tutarları pozitif.',
    });
  }

  // Check 3: Corresponding accounting period lock status
  const [year, month] = period.split('-').map((n) => Number.parseInt(n, 10));
  const periodDate = new Date(Date.UTC(year, month - 1, 1));

  const closedPeriod = await db.fiscalPeriod.findFirst({
    where: {
      tenantId,
      startDate: { lte: periodDate },
      endDate: { gte: periodDate },
      status: { in: [FiscalPeriodStatus.CLOSED, FiscalPeriodStatus.LOCKED] },
    },
    select: { name: true, status: true },
  });

  if (closedPeriod) {
    checks.push({
      name: 'Mali Dönem Durum Kontrolü',
      passed: false,
      message: `İlgili mali dönem (${closedPeriod.name}) kilitli veya kapalı durumda (${closedPeriod.status}). İşlem yapılamaz.`,
    });
  } else {
    checks.push({
      name: 'Mali Dönem Durum Kontrolü',
      passed: true,
      message: 'Mali dönem açık durumda, kayıt girilebilir.',
    });
  }

  const success = checks.every((c) => c.passed);

  return {
    success,
    checks,
  };
}
