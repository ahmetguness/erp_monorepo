import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';

export interface ProductBatchListInput {
  tenantId: string;
  page: number;
  pageSize: number;
  productId?: string;
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

export async function listProductBatches(input: ProductBatchListInput) {
  const skip = (input.page - 1) * input.pageSize;
  const where = {
    tenantId: input.tenantId,
    ...(input.productId && { productId: input.productId }),
  };

  const [total, batches] = await prisma.$transaction([
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
  ]);

  return {
    data: batches,
    meta: {
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function createProductBatch(input: CreateProductBatchInput) {
  if (!input.productId || !input.batchNumber) {
    throw new ValidationError('productId ve batchNumber zorunludur.');
  }

  return prisma.productBatch.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      batchNumber: input.batchNumber,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      manufacturedAt: input.manufacturedAt ? new Date(input.manufacturedAt) : null,
      quantity: input.quantity ?? 0,
      notes: input.notes ?? null,
    },
    include: {
      product: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function updateProductBatch(input: UpdateProductBatchInput) {
  const existing = await prisma.productBatch.findFirst({
    where: { id: input.id, tenantId: input.tenantId },
  });
  if (!existing) throw new NotFoundError('Parti', input.id);

  return prisma.productBatch.update({
    where: { id: input.id },
    data: {
      ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }),
      ...(input.manufacturedAt !== undefined && { manufacturedAt: input.manufacturedAt ? new Date(input.manufacturedAt) : null }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      product: { select: { id: true, code: true, name: true } },
    },
  });
}
