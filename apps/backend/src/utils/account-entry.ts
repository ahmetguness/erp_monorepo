import { Prisma } from '@prisma/client';
import { assertAccountingPeriodOpen } from '../services/financial-integrity.service';

// ─────────────────────────────────────────────
// AccountEntry Helper
// Fatura ve ödeme işlemlerinde cari hesap hareketi oluşturur.
// ─────────────────────────────────────────────

type TxClient = Prisma.TransactionClient;

/**
 * Fatura oluşturulduğunda cari hesap hareketi yazar.
 * SALES fatura → müşteriye borç (debit)
 * PURCHASE fatura → tedarikçiye alacak (credit)
 */
export async function writeInvoiceAccountEntry(
  tx: TxClient,
  params: {
    tenantId: string;
    contactId: string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceType: 'SALES' | 'PURCHASE' | 'RETURN_SALES' | 'RETURN_PURCHASE';
    totalGross: number;
    date: Date;
    userId?: string | null;
  },
): Promise<void> {
  await assertAccountingPeriodOpen(tx, params.tenantId, params.date, 'Fatura cari hareketi');

  const isSales = params.invoiceType === 'SALES' || params.invoiceType === 'RETURN_PURCHASE';
  const debit = isSales ? params.totalGross : 0;
  const credit = isSales ? 0 : params.totalGross;

  // Son bakiyeyi hesapla
  const lastEntry = await tx.accountEntry.findFirst({
    where: { tenantId: params.tenantId, contactId: params.contactId },
    orderBy: { date: 'desc' },
    select: { balance: true },
  });

  const prevBalance = lastEntry ? Number(lastEntry.balance) : 0;
  const balance = prevBalance + debit - credit;

  await tx.accountEntry.create({
    data: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      date: params.date,
      debit,
      credit,
      balance,
      description: `Fatura: ${params.invoiceNumber}`,
      refType: 'INVOICE',
      refId: params.invoiceId,
      createdById: params.userId ?? null,
    },
  });
}

/**
 * Fatura iptal edildiğinde ters kayıt yazar.
 */
export async function reverseInvoiceAccountEntry(
  tx: TxClient,
  params: {
    tenantId: string;
    contactId: string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceType: 'SALES' | 'PURCHASE' | 'RETURN_SALES' | 'RETURN_PURCHASE';
    totalGross: number;
    date: Date;
    userId?: string | null;
  },
): Promise<void> {
  await assertAccountingPeriodOpen(tx, params.tenantId, params.date, 'Fatura ters cari hareketi');

  // Ters kayıt: orijinal debit/credit'i tersine çevir
  const isSales = params.invoiceType === 'SALES' || params.invoiceType === 'RETURN_PURCHASE';
  const debit = isSales ? 0 : params.totalGross;
  const credit = isSales ? params.totalGross : 0;

  const lastEntry = await tx.accountEntry.findFirst({
    where: { tenantId: params.tenantId, contactId: params.contactId },
    orderBy: { date: 'desc' },
    select: { balance: true },
  });

  const prevBalance = lastEntry ? Number(lastEntry.balance) : 0;
  const balance = prevBalance + debit - credit;

  await tx.accountEntry.create({
    data: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      date: params.date,
      debit,
      credit,
      balance,
      description: `Fatura İptal: ${params.invoiceNumber}`,
      refType: 'INVOICE',
      refId: params.invoiceId,
      createdById: params.userId ?? null,
    },
  });
}

/**
 * Ödeme yapıldığında cari hesap hareketi yazar.
 * Tahsilat alacak, tediye borç hareketi oluşturur.
 */
export async function writePaymentAccountEntry(
  tx: TxClient,
  params: {
    tenantId: string;
    contactId: string;
    paymentId: string;
    reference?: string | null;
    amount: number;
    date: Date;
    direction?: 'RECEIVE' | 'SEND';
    userId?: string | null;
  },
): Promise<void> {
  await assertAccountingPeriodOpen(tx, params.tenantId, params.date, 'Odeme cari hareketi');

  const lastEntry = await tx.accountEntry.findFirst({
    where: { tenantId: params.tenantId, contactId: params.contactId },
    orderBy: { date: 'desc' },
    select: { balance: true },
  });

  const prevBalance = lastEntry ? Number(lastEntry.balance) : 0;
  const isOutgoingPayment = params.direction === 'SEND';
  const debit = isOutgoingPayment ? params.amount : 0;
  const credit = isOutgoingPayment ? 0 : params.amount;
  const balance = prevBalance + debit - credit;

  await tx.accountEntry.create({
    data: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      date: params.date,
      debit,
      credit,
      balance,
      description: params.reference ? `Ödeme: ${params.reference}` : 'Ödeme',
      refType: 'PAYMENT',
      refId: params.paymentId,
      createdById: params.userId ?? null,
    },
  });
}
