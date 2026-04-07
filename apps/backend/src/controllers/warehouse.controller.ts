import { Context } from 'hono';
import { MovementType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface CreateWarehouseDTO {
  code: string;
  name: string;
  address?: string;
}

interface UpdateWarehouseDTO {
  name?: string;
  address?: string;
  isActive?: boolean;
}

interface TransferStockDTO {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
}

interface CreateLocationDTO {
  name: string;
  code: string;
}

// ─────────────────────────────────────────────
// Warehouse Controller
// Depo CRUD + transfer işlemleri
// Tek depo kuralı enforceStarterLimits middleware'inde kontrol edilir.
// ─────────────────────────────────────────────

export const WarehouseController = {
  /**
   * GET /api/warehouses
   * Tenant'a ait depoları listeler.
   */
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const warehouses = await prisma.warehouse.findMany({
      where: { tenantId },
      include: {
        locations: {
          where: { isActive: true },
          select: { id: true, name: true, code: true },
        },
        _count: { select: { stockLevels: true } },
      },
      orderBy: { name: 'asc' },
    });

    return c.json({ data: warehouses });
  },

  /**
   * GET /api/warehouses/:id
   * Belirli bir depoyu döner.
   */
  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const warehouseId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      include: {
        locations: { where: { isActive: true } },
        stockLevels: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!warehouse) {
      return c.json(new NotFoundError('Depo', warehouseId).toJSON(), 404);
    }

    return c.json({ data: warehouse });
  },

  /**
   * POST /api/warehouses
   * Yeni depo oluşturur.
   * NOT: Tek depo kuralı enforceStarterLimits('warehouse') middleware'inde kontrol edilir.
   */
  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<CreateWarehouseDTO>();

    if (!body.code || !body.name) {
      return c.json(
        new ValidationError('code ve name alanları zorunludur.').toJSON(),
        400,
      );
    }

    const existing = await prisma.warehouse.findUnique({
      where: { tenantId_code: { tenantId, code: body.code } },
    });

    if (existing) {
      return c.json(
        new ValidationError(`"${body.code}" kodu zaten kullanımda.`).toJSON(),
        400,
      );
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId,
        code: body.code,
        name: body.name,
        address: body.address ?? null,
      },
    });

    return c.json({ data: warehouse }, 201);
  },

  /**
   * PATCH /api/warehouses/:id
   * Depo bilgilerini günceller.
   */
  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const warehouseId = c.req.param('id');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const warehouse = await prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
    });

    if (!warehouse) {
      return c.json(new NotFoundError('Depo', warehouseId).toJSON(), 404);
    }

    const body = await c.req.json<UpdateWarehouseDTO>();

    const updated = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return c.json({ data: updated });
  },

  /**
   * POST /api/warehouses/transfer
   * Depolar arası stok transferi.
   * NOT: MULTI_WAREHOUSE kontrolü enforceStarterLimits('warehouse_transfer') middleware'inde yapılır.
   */
  async transfer(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');

    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const body = await c.req.json<TransferStockDTO>();

    if (!body.productId || !body.fromWarehouseId || !body.toWarehouseId || !body.quantity) {
      return c.json(
        new ValidationError(
          'productId, fromWarehouseId, toWarehouseId ve quantity alanları zorunludur.',
        ).toJSON(),
        400,
      );
    }

    if (body.quantity <= 0) {
      return c.json(
        new ValidationError('Miktar 0\'dan büyük olmalıdır.').toJSON(),
        400,
      );
    }

    if (body.fromWarehouseId === body.toWarehouseId) {
      return c.json(
        new ValidationError('Kaynak ve hedef depo aynı olamaz.').toJSON(),
        400,
      );
    }

    // Kaynak depoda yeterli stok var mı?
    const sourceStock = await prisma.stockLevel.findFirst({
      where: {
        tenantId,
        productId: body.productId,
        warehouseId: body.fromWarehouseId,
      },
    });

    if (!sourceStock || Number(sourceStock.quantity) < body.quantity) {
      return c.json(
        new ValidationError(
          `Kaynak depoda yeterli stok yok. Mevcut: ${sourceStock?.quantity ?? 0}`,
        ).toJSON(),
        400,
      );
    }

    // Transfer işlemi — transaction içinde
    const movement = await prisma.$transaction(async (tx) => {
      // Stok hareketi oluştur
      const stockMovement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: body.productId,
          type: MovementType.TRANSFER,
          quantity: body.quantity,
          fromWarehouseId: body.fromWarehouseId,
          toWarehouseId: body.toWarehouseId,
          notes: body.notes ?? null,
        },
      });

      // Kaynak depo stok azalt
      await tx.stockLevel.updateMany({
        where: {
          tenantId,
          productId: body.productId,
          warehouseId: body.fromWarehouseId,
        },
        data: { quantity: { decrement: body.quantity } },
      });

      // Hedef depo stok artır (yoksa oluştur)
      await tx.stockLevel.upsert({
        where: {
          productId_warehouseId_locationId: {
            productId: body.productId,
            warehouseId: body.toWarehouseId,
            locationId: '',
          },
        },
        create: {
          tenantId,
          productId: body.productId,
          warehouseId: body.toWarehouseId,
          locationId: '',
          quantity: body.quantity,
        },
        update: { quantity: { increment: body.quantity } },
      });

      return stockMovement;
    });

    return c.json({ data: movement }, 201);
  },
};

// ─────────────────────────────────────────────
// Location Controller
// Depo içi lokasyon yönetimi
// ─────────────────────────────────────────────

export const LocationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const warehouseId = c.req.param('warehouseId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
    if (!warehouse) return c.json(new NotFoundError('Depo', warehouseId).toJSON(), 404);

    const locations = await prisma.location.findMany({
      where: { warehouseId, tenantId, isActive: true },
      orderBy: { code: 'asc' },
    });

    return c.json({ data: locations });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const warehouseId = c.req.param('warehouseId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }
    if (!warehouseId) {
      return c.json(new ValidationError('warehouseId zorunludur.').toJSON(), 400);
    }

    const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
    if (!warehouse) return c.json(new NotFoundError('Depo', warehouseId).toJSON(), 404);

    const body = await c.req.json<CreateLocationDTO>();

    if (!body.name || !body.code) {
      return c.json(new ValidationError('name ve code alanları zorunludur.').toJSON(), 400);
    }

    const existing = await prisma.location.findUnique({
      where: { warehouseId_code: { warehouseId, code: body.code } },
    });
    if (existing) {
      return c.json(new ValidationError(`"${body.code}" kodu bu depoda zaten kullanımda.`).toJSON(), 400);
    }

    const location = await prisma.location.create({
      data: { tenantId, warehouseId, name: body.name, code: body.code },
    });

    return c.json({ data: location }, 201);
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const warehouseId = c.req.param('warehouseId');
    const locationId = c.req.param('locationId');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, warehouseId, tenantId },
    });
    if (!location) return c.json(new NotFoundError('Lokasyon', locationId).toJSON(), 404);

    await prisma.location.update({ where: { id: locationId }, data: { isActive: false } });
    return c.json({ data: { success: true } });
  },
};
