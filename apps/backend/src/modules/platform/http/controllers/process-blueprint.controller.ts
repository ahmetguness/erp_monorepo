import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js'; import { prisma } from '../../../../lib/prisma.js'; import { requireParam, requireTenantId } from '../../../../utils/context.js';
import { BLUEPRINT_SECTIONS, ProcessBlueprintService, SECTOR_BLUEPRINTS, parseProcessBlueprint } from '../../application/process-blueprint/index.js'; import { PrismaProcessBlueprintRepository } from '../../infrastructure/persistence/prisma-process-blueprint.repository.js';
const service = new ProcessBlueprintService(new PrismaProcessBlueprintRepository(prisma));
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('İstek gövdesi geçersiz.'); return value as Record<string, unknown>; };
const sections = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [...BLUEPRINT_SECTIONS];
const optionalVersion = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ValidationError('Sürüm pozitif bir tam sayı olmalıdır.');
  return parsed;
};
export const ProcessBlueprintController = {
  async list(c: Context): Promise<Response> { return c.json({ data: await service.list(requireTenantId(c)), meta: { sections: BLUEPRINT_SECTIONS } }); },
  async sectors(c: Context): Promise<Response> { return c.json({ data: SECTOR_BLUEPRINTS }); },
  async create(c: Context): Promise<Response> { const body = record(await c.req.json<unknown>()); const data = await service.create(requireTenantId(c), { key: typeof body.key === 'string' ? body.key : '', name: typeof body.name === 'string' ? body.name : '', description: typeof body.description === 'string' ? body.description : undefined, industry: typeof body.industry === 'string' ? body.industry : undefined }); return c.json({ data }, 201); },
  async export(c: Context): Promise<Response> { return c.json({ data: await service.export(requireTenantId(c), requireParam(c, 'key'), optionalVersion(c.req.query('version'))) }); },
  async import(c: Context): Promise<Response> { return c.json({ data: await service.import(requireTenantId(c), parseProcessBlueprint(await c.req.json<unknown>())) }, 201); },
  async preview(c: Context): Promise<Response> { const body = record(await c.req.json<unknown>()); return c.json({ data: await service.preview(requireTenantId(c), parseProcessBlueprint(body.blueprint), sections(body.sections)) }); },
  async apply(c: Context): Promise<Response> { const body = record(await c.req.json<unknown>()); return c.json({ data: await service.apply(requireTenantId(c), parseProcessBlueprint(body.blueprint), sections(body.sections)) }); },
};
