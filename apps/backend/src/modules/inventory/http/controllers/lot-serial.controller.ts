import { LotUsedRefType, Prisma } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError, NotFoundError, ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { LotSerialTraceabilityService } from '../../../../services/lot-serial-traceability.service.js';
import { requireParam, requireTenantId } from '../../../../utils/context.js';

interface LotSerialListQuery { page?: string; limit?: string; productId?: string; batchId?: string; isUsed?: string; search?: string }
interface TraceabilityQuery { lotId?: string; batchId?: string; productId?: string; serialNumber?: string }
interface CreateLotSerialDTO { productId: string; batchId?: string; serialNumber: string }
interface AssignToMovementDTO { usedRefType: LotUsedRefType; usedRefId: string }

const traceabilityService = new LotSerialTraceabilityService(prisma);

function positiveInteger(value: string | undefined, fallback: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new ValidationError(`${field} pozitif bir tam sayi olmalidir.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new ValidationError(`${field} 1-${maximum} araliginda olmalidir.`);
  return parsed;
}

async function referenceExists(tenantId: string, type: LotUsedRefType, id: string): Promise<boolean> {
  if (type === LotUsedRefType.OTHER) return true;
  if (type === LotUsedRefType.SALES_ORDER) return Boolean(await prisma.salesOrder.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } }));
  if (type === LotUsedRefType.WORK_ORDER) return Boolean(await prisma.workOrder.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } }));
  return Boolean(await prisma.deliveryNote.findFirst({ where: { id, tenantId }, select: { id: true } }));
}

export const LotSerialController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as LotSerialListQuery;
    const page = positiveInteger(query.page, 1, 100_000, 'page');
    const pageSize = positiveInteger(query.limit, 20, 100, 'limit');
    if (query.isUsed !== undefined && query.isUsed !== 'true' && query.isUsed !== 'false') throw new ValidationError('isUsed true veya false olmalidir.');
    const search = query.search?.trim();
    if (search && search.length > 100) throw new ValidationError('search en fazla 100 karakter olabilir.');
    const where: Prisma.LotSerialNumberWhereInput = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.isUsed !== undefined ? { isUsed: query.isUsed === 'true' } : {}),
      ...(search ? { OR: [
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { product: { is: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } } },
        { batch: { is: { batchNumber: { contains: search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [total, lots] = await prisma.$transaction([
      prisma.lotSerialNumber.count({ where }),
      prisma.lotSerialNumber.findMany({
        where,
        include: { product: { select: { id: true, code: true, name: true } }, batch: { select: { id: true, batchNumber: true } } },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return c.json({ data: lots, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<CreateLotSerialDTO>();
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const serialNumber = typeof body.serialNumber === 'string' ? body.serialNumber.trim() : '';
    if (!productId || !serialNumber) throw new ValidationError('productId ve serialNumber zorunludur.');
    if (serialNumber.length > 200) throw new ValidationError('serialNumber en fazla 200 karakter olabilir.');
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null }, select: { id: true } });
    if (!product) throw new ValidationError('productId bu tenant icin gecersiz.');
    if (body.batchId) {
      const batch = await prisma.productBatch.findFirst({ where: { id: body.batchId, tenantId, productId }, select: { id: true } });
      if (!batch) throw new ValidationError('batchId secilen tenant ve urun ile uyumlu degildir.');
    }
    try {
      const lot = await prisma.lotSerialNumber.create({
        data: { tenantId, productId, batchId: body.batchId ?? null, serialNumber },
        include: { product: { select: { id: true, code: true, name: true } }, batch: { select: { id: true, batchNumber: true } } },
      });
      return c.json({ data: lot }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('Bu urun icin ayni lot/seri numarasi zaten mevcut.');
      throw error;
    }
  },

  async traceability(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as TraceabilityQuery;
    const serialNumber = query.serialNumber?.trim();
    if (serialNumber && serialNumber.length > 200) throw new ValidationError('serialNumber en fazla 200 karakter olabilir.');
    const report = await traceabilityService.getReport(tenantId, { lotId: query.lotId, batchId: query.batchId, productId: query.productId, serialNumber });
    return c.json({ data: report });
  },

  async assignToMovement(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const existing = await prisma.lotSerialNumber.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundError('Lot/Seri No', id);
    const body = await c.req.json<AssignToMovementDTO>();
    if (!body.usedRefType || !Object.values(LotUsedRefType).includes(body.usedRefType)) throw new ValidationError('usedRefType gecersiz.');
    const usedRefId = typeof body.usedRefId === 'string' ? body.usedRefId.trim() : '';
    if (!usedRefId || usedRefId.length > 200) throw new ValidationError('usedRefId gecersiz.');
    if (!(await referenceExists(tenantId, body.usedRefType, usedRefId))) throw new NotFoundError('Kullanim referansi', usedRefId);
    const result = await prisma.lotSerialNumber.updateMany({
      where: { id, tenantId, isUsed: false },
      data: { isUsed: true, usedAt: new Date(), usedRefType: body.usedRefType, usedRefId },
    });
    if (result.count !== 1) throw new ConflictError('Bu lot/seri numarasi zaten kullanilmis.');
    const updated = await prisma.lotSerialNumber.findFirstOrThrow({
      where: { id, tenantId },
      include: { product: { select: { id: true, code: true, name: true } }, batch: { select: { id: true, batchNumber: true } } },
    });
    return c.json({ data: updated });
  },
};
