import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createImportFingerprint, type MappingProfile, type MappingProfileRepository, type SaveMappingProfileInput } from '../../application/bulk-import-assistance/index.js';

const MODULE = 'bulk_import_mapping';
const KEY = 'profiles';
const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  target: z.enum(['contacts', 'products', 'invoices']),
  fingerprint: z.string(),
  mappings: z.array(z.object({ source: z.string(), target: z.string(), confidence: z.number().min(0).max(1), learned: z.boolean() })),
  updatedAt: z.string(),
});

function parseProfiles(value: string | undefined): MappingProfile[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    const result = z.array(profileSchema).safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export class PrismaMappingProfileRepository implements MappingProfileRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string): Promise<MappingProfile[]> {
    const setting = await this.db.moduleSetting.findUnique({ where: { tenantId_module_key: { tenantId, module: MODULE, key: KEY } }, select: { value: true } });
    return parseProfiles(setting?.value);
  }

  async save(tenantId: string, input: SaveMappingProfileInput): Promise<MappingProfile> {
    const profiles = await this.list(tenantId);
    const fingerprint = createImportFingerprint(input.headers);
    const previous = profiles.find((item) => item.target === input.target && item.fingerprint === fingerprint);
    const profile: MappingProfile = { id: previous?.id ?? randomUUID(), name: input.name.trim(), target: input.target, fingerprint, mappings: input.mappings, updatedAt: new Date().toISOString() };
    const next = [...profiles.filter((item) => item.id !== profile.id), profile].slice(-25);
    await this.db.moduleSetting.upsert({ where: { tenantId_module_key: { tenantId, module: MODULE, key: KEY } }, create: { tenantId, module: MODULE, key: KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
    return profile;
  }
}
