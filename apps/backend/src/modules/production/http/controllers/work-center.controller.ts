import { Prisma } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { requireParam,requireTenantId } from '../../../../utils/context.js';
import { getPaginationParams } from '../../../../utils/pagination.js';

function requiredText(value: unknown, field: string, max: number): string { if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} zorunludur.`); const result = value.trim(); if (result.length > max) throw new ValidationError(`${field} en fazla ${max} karakter olabilir.`); return result; }
function optionalDecimal(value: unknown, field: string): number | undefined { if (value === undefined) return undefined; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99_999_999.99) throw new ValidationError(`${field} negatif olmayan geçerli bir sayı olmalıdır.`); return value; }

export const WorkCenterController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c); const { page, limit, skip } = getPaginationParams(c, 50); const search = c.req.query('search')?.trim(); const status = c.req.query('status');
    if (status && !['active', 'passive'].includes(status)) return c.json(new ValidationError('Geçersiz iş merkezi durum filtresi.').toJSON(), 400);
    const where = { tenantId, ...(status ? { isActive: status === 'active' } : {}), ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }, { description: { contains: search, mode: 'insensitive' as const } }] } : {}) };
    const [total, data] = await prisma.$transaction([prisma.workCenter.count({ where }), prisma.workCenter.findMany({ where, include: { _count: { select: { operations: true, workOrderOps: true } } }, orderBy: { code: 'asc' }, skip, take: limit })]);
    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },
  async getById(c: Context): Promise<Response> { const tenantId = requireTenantId(c); const id = requireParam(c, 'id'); const wc = await prisma.workCenter.findFirst({ where: { id, tenantId }, include: { operations: { include: { bom: { select: { id: true, name: true } } }, orderBy: { stepOrder: 'asc' } } } }); if (!wc) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404); return c.json({ data: wc }); },
  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c); const body = await c.req.json<{ code: string; name: string; description?: string; capacity?: number; laborRate?: number; overheadRate?: number }>(); let code: string; let name: string; let capacity; let laborRate; let overheadRate;
    try { code = requiredText(body.code, 'code', 50); name = requiredText(body.name, 'name', 200); capacity = optionalDecimal(body.capacity, 'capacity'); laborRate = optionalDecimal(body.laborRate, 'laborRate'); overheadRate = optionalDecimal(body.overheadRate, 'overheadRate'); if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 2000)) throw new ValidationError('description en fazla 2000 karakter olabilir.'); } catch (error) { if (error instanceof ValidationError) return c.json(error.toJSON(), 400); throw error; }
    try { const wc = await prisma.workCenter.create({ data: { tenantId, code, name, description: body.description?.trim() || null, capacity: capacity ?? null, laborRate: laborRate ?? null, overheadRate: overheadRate ?? null } }); return c.json({ data: wc }, 201); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return c.json(new ConflictError('Bu kodla iş merkezi zaten mevcut.').toJSON(), 409); throw error; }
  },
  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c); const id = requireParam(c, 'id'); const existing = await prisma.workCenter.findFirst({ where: { id, tenantId } }); if (!existing) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);
    const body = await c.req.json<{ name?: string; description?: string | null; capacity?: number | null; isActive?: boolean; laborRate?: number | null; overheadRate?: number | null }>(); let name: string | undefined;
    try { if (body.name !== undefined) name = requiredText(body.name, 'name', 200); if (body.description !== undefined && body.description !== null && (typeof body.description !== 'string' || body.description.length > 2000)) throw new ValidationError('description en fazla 2000 karakter olabilir.'); if (body.capacity !== null) optionalDecimal(body.capacity, 'capacity'); if (body.laborRate !== null) optionalDecimal(body.laborRate, 'laborRate'); if (body.overheadRate !== null) optionalDecimal(body.overheadRate, 'overheadRate'); if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw new ValidationError('isActive boolean olmalıdır.'); } catch (error) { if (error instanceof ValidationError) return c.json(error.toJSON(), 400); throw error; }
    const updated = await prisma.workCenter.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(body.description !== undefined && { description: body.description?.trim() || null }), ...(body.capacity !== undefined && { capacity: body.capacity }), ...(body.isActive !== undefined && { isActive: body.isActive }), ...(body.laborRate !== undefined && { laborRate: body.laborRate }), ...(body.overheadRate !== undefined && { overheadRate: body.overheadRate }) } }); return c.json({ data: updated });
  },
  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c); const id = requireParam(c, 'id'); const existing = await prisma.workCenter.findFirst({ where: { id, tenantId } }); if (!existing) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404);
    const [workOrderOps, routings, capacities] = await Promise.all([prisma.workOrderOperation.count({ where: { tenantId, workCenterId: id } }), prisma.routingOperation.count({ where: { tenantId, workCenterId: id } }), prisma.workCenterCapacity.count({ where: { tenantId, workCenterId: id } })]);
    if (workOrderOps || routings || capacities) return c.json(new ConflictError('BOM, iş emri veya kapasite takviminde kullanılan iş merkezi silinemez.').toJSON(), 409);
    await prisma.workCenter.delete({ where: { id } }); return c.json({ data: { success: true } });
  },
  async getCapacityCalendar(c: Context): Promise<Response> { const tenantId = requireTenantId(c); const id = requireParam(c, 'id'); const workCenter = await prisma.workCenter.findFirst({ where: { id, tenantId }, select: { id: true } }); if (!workCenter) return c.json(new NotFoundError('İş Merkezi', id).toJSON(), 404); const capacities = await prisma.workCenterCapacity.findMany({ where: { tenantId, workCenterId: id }, orderBy: { date: 'asc' } }); return c.json({ data: capacities }); },
};
