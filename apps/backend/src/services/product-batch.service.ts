import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

export interface ProductBatchListInput {
  tenantId: string;
  page: number;
  pageSize: number;
  productId?: string;
  search?: string;
  status?: 'all' | 'active' | 'empty' | 'expiring' | 'expired' | 'noExpiry';
}

export interface CreateProductBatchInput {
  tenantId: string;
  productId: string;
  batchNumber: string;
  expiryDate?: string;
  manufacturedAt?: string;
  quantity?: number;
  notes?: string;
}

export interface UpdateProductBatchInput {
  tenantId: string;
  id: string;
  expiryDate?: string;
  manufacturedAt?: string;
  quantity?: number;
  notes?: string;
}

const MAX_DECIMAL_18_3 = 1_000_000_000_000_000;

function text(value: unknown, field: string, maximum: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} zorunludur.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} metin olmalidir.`);
  const normalized = value.trim();
  if (required && !normalized) throw new ValidationError(`${field} zorunludur.`);
  if (normalized.length > maximum) throw new ValidationError(`${field} en fazla ${maximum} karakter olabilir.`);
  return normalized;
}

function quantity(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= MAX_DECIMAL_18_3)
    throw new ValidationError('quantity gecersiz veya desteklenen araligin disinda.');
  if (Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-7)
    throw new ValidationError('quantity en fazla 3 ondalik basamak icerebilir.');
  return value;
}

function date(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ValidationError(`${field} YYYY-MM-DD formatinda olmalidir.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ValidationError(`${field} gecersiz.`);
  return parsed;
}

function validateDateOrder(manufacturedAt: Date | null | undefined, expiryDate: Date | null | undefined) {
  if (manufacturedAt && expiryDate && manufacturedAt > expiryDate)
    throw new ValidationError('manufacturedAt expiryDate sonrasinda olamaz.');
}

export async function listProductBatches(input: ProductBatchListInput) {
  const skip = (input.page - 1) * input.pageSize;
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const expiring = new Date(now);
  expiring.setUTCDate(expiring.getUTCDate() + 30);
  const statusWhere: Prisma.ProductBatchWhereInput = input.status === 'active'
    ? { quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: expiring } }] }
    : input.status === 'empty' ? { quantity: { lte: 0 } }
      : input.status === 'expiring' ? { quantity: { gt: 0 }, expiryDate: { gte: now, lte: expiring } }
        : input.status === 'expired' ? { quantity: { gt: 0 }, expiryDate: { lt: now } }
          : input.status === 'noExpiry' ? { expiryDate: null }
            : {};
  const where: Prisma.ProductBatchWhereInput = {
    tenantId: input.tenantId,
    ...(input.productId && { productId: input.productId }),
    AND: [
      statusWhere,
      ...(input.search ? [{ OR: [
        { batchNumber: { contains: input.search, mode: 'insensitive' as const } },
        { product: { is: { OR: [
          { name: { contains: input.search, mode: 'insensitive' as const } },
          { code: { contains: input.search, mode: 'insensitive' as const } },
        ] } } },
      ] }] : []),
    ],
  };

  const activeWhere: Prisma.ProductBatchWhereInput = {
    AND: [where, { quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] }],
  };
  const expiringWhere: Prisma.ProductBatchWhereInput = {
    AND: [where, { quantity: { gt: 0 }, expiryDate: { gte: now, lte: expiring } }],
  };
  const [total, batches, quantitySummary, active, expiringCount, lots] = await prisma.$transaction([
    prisma.productBatch.count({ where }),
    prisma.productBatch.findMany({
      where,
      include: {
        product: { select: { id: true, code: true, name: true } },
        _count: { select: { lots: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.pageSize,
    }),
    prisma.productBatch.aggregate({ where, _sum: { quantity: true } }),
    prisma.productBatch.count({ where: activeWhere }),
    prisma.productBatch.count({ where: expiringWhere }),
    prisma.lotSerialNumber.count({ where: { tenantId: input.tenantId, batch: { is: where } } }),
  ]);

  return {
    data: batches,
    meta: {
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
    },
    summary: {
      active,
      totalQty: Number(quantitySummary._sum.quantity ?? 0),
      lots,
      expiring: expiringCount,
    },
  };
}

export async function createProductBatch(input: CreateProductBatchInput) {
  const productId = text(input.productId, 'productId', 100, true)!;
  const batchNumber = text(input.batchNumber, 'batchNumber', 100, true)!;
  const expiryDate = date(input.expiryDate, 'expiryDate');
  const manufacturedAt = date(input.manufacturedAt, 'manufacturedAt');
  const parsedQuantity = quantity(input.quantity);
  const notes = text(input.notes, 'notes', 2000);
  validateDateOrder(manufacturedAt, expiryDate);
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new ValidationError('productId bu tenant icin gecersiz.');

  try {
    return await prisma.productBatch.create({
      data: {
        tenantId: input.tenantId,
        productId,
        batchNumber,
        expiryDate: expiryDate ?? null,
        manufacturedAt: manufacturedAt ?? null,
        quantity: parsedQuantity ?? 0,
        notes: notes ?? null,
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictError('Bu urun icin ayni parti numarasi zaten mevcut.');
    throw error;
  }
}

export async function updateProductBatch(input: UpdateProductBatchInput) {
  const existing = await prisma.productBatch.findFirst({
    where: { id: input.id, tenantId: input.tenantId },
  });
  if (!existing) throw new NotFoundError('Parti', input.id);

  const expiryDate = date(input.expiryDate, 'expiryDate');
  const manufacturedAt = date(input.manufacturedAt, 'manufacturedAt');
  const parsedQuantity = quantity(input.quantity);
  const notes = text(input.notes, 'notes', 2000);
  if (expiryDate === undefined && manufacturedAt === undefined && parsedQuantity === undefined && notes === undefined)
    throw new ValidationError('Guncellenecek en az bir alan zorunludur.');
  validateDateOrder(manufacturedAt === undefined ? existing.manufacturedAt : manufacturedAt, expiryDate === undefined ? existing.expiryDate : expiryDate);

  return prisma.productBatch.update({
    where: { id: input.id },
    data: {
      ...(expiryDate !== undefined && { expiryDate }),
      ...(manufacturedAt !== undefined && { manufacturedAt }),
      ...(parsedQuantity !== undefined && { quantity: parsedQuantity }),
      ...(notes !== undefined && { notes: notes || null }),
    },
    include: {
      product: { select: { id: true, code: true, name: true } },
    },
  });
}
