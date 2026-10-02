import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { assertAccountingPeriodOpen } from '../../../../services/financial-integrity.service.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';

interface LineInput { accountId: string; refType?: string; refId?: string; amount: number; notes?: string }
const MAX_AMOUNT = 9_999_999_999_999_999;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
async function readBody(c: Context) { const raw = await c.req.text(); if (!raw.trim()) return {}; try { const value: unknown = JSON.parse(raw); if (isRecord(value)) return value; } catch {} throw new ValidationError('Geçersiz JSON gövdesi.'); }
function readText(value: unknown, field: string, max: number, required = false) { if (value == null) { if (required) throw new ValidationError(`${field} zorunludur.`); return undefined; } if (typeof value !== 'string') throw new ValidationError(`${field} metin olmalıdır.`); const result = value.trim(); if (required && !result) throw new ValidationError(`${field} zorunludur.`); if (result.length > max) throw new ValidationError(`${field} en fazla ${max} karakter olabilir.`); return result || undefined; }
function readDate(value: unknown) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('date YYYY-MM-DD formatında zorunludur.'); const result = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new ValidationError('date geçerli bir tarih olmalıdır.'); return result; }
function readLine(value: unknown, index?: number): LineInput { const p = index === undefined ? '' : `lines.${index}.`; if (!isRecord(value)) throw new ValidationError(`${p || 'line'} geçersizdir.`); const accountId = readText(value.accountId, `${p}accountId`, 100, true)!; if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount === 0 || Math.abs(value.amount) > MAX_AMOUNT || Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 1e-7) throw new ValidationError(`${p}amount sıfırdan farklı, sonlu ve en fazla iki ondalıklı olmalıdır.`); const refType = readText(value.refType, `${p}refType`, 100), refId = readText(value.refId, `${p}refId`, 191), notes = readText(value.notes, `${p}notes`, 500); return { accountId, amount: value.amount, ...(refType && { refType }), ...(refId && { refId }), ...(notes && { notes }) }; }
async function assertAccounts(tenantId: string, lines: LineInput[]) { const ids = [...new Set(lines.map(x => x.accountId))]; if (!ids.length) return; const count = await prisma.ledgerAccount.count({ where: { tenantId, id: { in: ids }, deletedAt: null, isActive: true } }); if (count !== ids.length) throw new ValidationError('Satırlardaki hesaplardan biri bu tenant içinde aktif değil.'); }

export const ReconciliationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), p = c.req.query('page'), l = c.req.query('limit'), status = c.req.query('isFinalized');
    if (p !== undefined && (!/^\d+$/.test(p) || Number(p) < 1)) throw new ValidationError('page pozitif tam sayı olmalıdır.');
    if (l !== undefined && (!/^\d+$/.test(l) || Number(l) < 1 || Number(l) > 100)) throw new ValidationError('limit 1-100 arasında olmalıdır.');
    if (status !== undefined && status !== 'true' && status !== 'false') throw new ValidationError('isFinalized true veya false olmalıdır.');
    const page = Number(p ?? 1), pageSize = Number(l ?? 20), where = { tenantId, ...(status !== undefined && { isFinalized: status === 'true' }) };
    const [total, data] = await prisma.$transaction([prisma.reconciliation.count({ where }), prisma.reconciliation.findMany({ where, include: { _count: { select: { lines: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize })]);
    return c.json({ data, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
  },
  async getById(c: Context): Promise<Response> { const tenantId = requireTenantId(c), id = requireParam(c, 'id'); const data = await prisma.reconciliation.findFirst({ where: { id, tenantId }, include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } } }); if (!data) return c.json(new NotFoundError('Mutabakat', id).toJSON(), 404); return c.json({ data }); },
  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), body = await readBody(c); const name = readText(body.name, 'name', 200, true)!, description = readText(body.description, 'description', 1000), reconciliationDate = readDate(body.date);
    if (body.lines !== undefined && (!Array.isArray(body.lines) || body.lines.length > 1000)) throw new ValidationError('lines en fazla 1000 satır içerebilir.'); const lines = Array.isArray(body.lines) ? body.lines.map(readLine) : [];
    await assertAccountingPeriodOpen(prisma, tenantId, reconciliationDate, 'Mutabakat'); await assertAccounts(tenantId, lines);
    const data = await prisma.reconciliation.create({ data: { tenantId, name, description: description ?? null, date: reconciliationDate, ...(lines.length ? { lines: { create: lines.map(x => ({ tenantId, accountId: x.accountId, refType: x.refType ?? null, refId: x.refId ?? null, amount: x.amount, notes: x.notes ?? null })) } } : {}) }, include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } } }); return c.json({ data }, 201);
  },
  async addLine(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), id = requireParam(c, 'id'), reconciliation = await prisma.reconciliation.findFirst({ where: { id, tenantId } }); if (!reconciliation) return c.json(new NotFoundError('Mutabakat', id).toJSON(), 404); if (reconciliation.isFinalized) throw new ValidationError('Tamamlanmış mutabakata satır eklenemez.'); await assertAccountingPeriodOpen(prisma, tenantId, reconciliation.date, 'Mutabakat satırı'); const body = readLine(await readBody(c)); await assertAccounts(tenantId, [body]); const data = await prisma.reconciliationLine.create({ data: { tenantId, reconciliationId: id, accountId: body.accountId, refType: body.refType ?? null, refId: body.refId ?? null, amount: body.amount, notes: body.notes ?? null }, include: { account: { select: { id: true, code: true, name: true } } } }); return c.json({ data }, 201);
  },
  async finalize(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c), userId = requireUserId(c), id = requireParam(c, 'id'), reconciliation = await prisma.reconciliation.findFirst({ where: { id, tenantId }, include: { _count: { select: { lines: true } } } }); if (!reconciliation) return c.json(new NotFoundError('Mutabakat', id).toJSON(), 404); if (reconciliation.isFinalized) throw new ConflictError('Mutabakat zaten tamamlanmış.'); if (!reconciliation._count.lines) throw new ValidationError('Satır olmadan mutabakat tamamlanamaz.'); await assertAccountingPeriodOpen(prisma, tenantId, reconciliation.date, 'Mutabakat tamamlama'); const result = await prisma.reconciliation.updateMany({ where: { id, tenantId, isFinalized: false }, data: { isFinalized: true, finalizedAt: new Date(), finalizedById: userId } }); if (result.count !== 1) throw new ConflictError('Mutabakat başka bir işlem tarafından zaten tamamlandı.'); return c.json({ data: await prisma.reconciliation.findUniqueOrThrow({ where: { id } }) });
  },
};
