import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RELEASE_PROTOCOL } from '../../packages/types/src/release.js';
import { requiresContractReview } from './migration-policy.js';

export interface MigrationEntry { id: string; checksum: string; destructive: boolean }
export interface ReleaseManifest {
  schemaVersion: 1;
  version: string;
  gitSha: string;
  createdAt: string;
  images: { backend: string; web: string; migrator: string };
  apiContractVersion: number;
  minimumApiContractVersion: number;
  eventSchemaVersion: number;
  minimumEventSchemaVersion: number;
  featureFlagVersion: number;
  migrationVersion: string;
  migrations: MigrationEntry[];
  rollback: { strategy: 'application-only'; database: 'forward-fix'; requiresCompatibleSchema: true };
}

const imagePattern = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const checksumPattern = /^[a-f0-9]{64}$/;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid release manifest.');
  return value as Record<string, unknown>;
}
function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) throw new Error('Invalid release manifest field.');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error('Invalid release protocol.');
  return value;
}
export function parseManifest(value: unknown): ReleaseManifest {
  const input = record(value);
  const images = record(input.images);
  const rollback = record(input.rollback);
  if (input.schemaVersion !== 1 || rollback.strategy !== 'application-only' || rollback.database !== 'forward-fix' || rollback.requiresCompatibleSchema !== true || !Array.isArray(input.migrations)) throw new Error('Unsupported release protocol.');
  const migrations = input.migrations.map((value: unknown): MigrationEntry => {
    const item = record(value);
    if (typeof item.destructive !== 'boolean') throw new Error('Invalid migration policy.');
    return { id: string(item.id, /^\d{14}_[a-zA-Z0-9_]+$/), checksum: string(item.checksum, checksumPattern), destructive: item.destructive };
  });
  if (!migrations.length || new Set(migrations.map((item) => item.id)).size !== migrations.length || migrations.some((item, index) => index > 0 && migrations[index - 1].id >= item.id)) throw new Error('Migration history must be ordered and unique.');
  const migrationVersion = string(input.migrationVersion);
  if (migrationVersion !== migrations.at(-1)?.id) throw new Error('Migration tip does not match history.');
  const createdAt = string(input.createdAt);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid release date.');
  if (integer(input.minimumApiContractVersion) > integer(input.apiContractVersion) || integer(input.minimumEventSchemaVersion) > integer(input.eventSchemaVersion)) throw new Error('Invalid compatibility range.');
  return {
    schemaVersion: 1, version: string(input.version, semverPattern), gitSha: string(input.gitSha, /^[a-f0-9]{40}$/), createdAt,
    images: { backend: string(images.backend, imagePattern), web: string(images.web, imagePattern), migrator: string(images.migrator, imagePattern) },
    apiContractVersion: integer(input.apiContractVersion), minimumApiContractVersion: integer(input.minimumApiContractVersion),
    eventSchemaVersion: integer(input.eventSchemaVersion), minimumEventSchemaVersion: integer(input.minimumEventSchemaVersion), featureFlagVersion: integer(input.featureFlagVersion),
    migrationVersion, migrations, rollback: { strategy: 'application-only', database: 'forward-fix', requiresCompatibleSchema: true },
  };
}
export function generateManifest(root: string, gitSha: string, images: ReleaseManifest['images']): ReleaseManifest {
  const manifest = record(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as unknown);
  const directory = resolve(root, 'apps/backend/prisma/schema/migrations');
  const migrations = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry): MigrationEntry => {
    const sql = readFileSync(resolve(directory, entry.name, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    return { id: entry.name, checksum: createHash('sha256').update(sql).digest('hex'), destructive: requiresContractReview(sql) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return parseManifest({
    schemaVersion: 1, version: manifest.version, gitSha, createdAt: new Date().toISOString(), images,
    apiContractVersion: RELEASE_PROTOCOL.apiContract, minimumApiContractVersion: RELEASE_PROTOCOL.minimumApiContract,
    eventSchemaVersion: RELEASE_PROTOCOL.eventSchema, minimumEventSchemaVersion: RELEASE_PROTOCOL.minimumEventSchema,
    featureFlagVersion: RELEASE_PROTOCOL.featureFlags, migrations, migrationVersion: migrations.at(-1)?.id,
    rollback: { strategy: 'application-only', database: 'forward-fix', requiresCompatibleSchema: true },
  });
}
export function assertCompatible(previous: ReleaseManifest, next: ReleaseManifest, rollback = false): void {
  if (rollback && (previous.apiContractVersion !== next.apiContractVersion || previous.eventSchemaVersion !== next.eventSchemaVersion || previous.featureFlagVersion !== next.featureFlagVersion)) throw new Error('Rollback requires identical API, worker and feature protocols.');
  if (previous.apiContractVersion < next.minimumApiContractVersion || next.apiContractVersion < previous.minimumApiContractVersion
    || previous.eventSchemaVersion < next.minimumEventSchemaVersion || next.eventSchemaVersion < previous.minimumEventSchemaVersion) throw new Error('Release API/event protocols are incompatible.');
  const shorter = rollback ? next.migrations : previous.migrations;
  const longer = rollback ? previous.migrations : next.migrations;
  if (shorter.some((item, index) => longer[index]?.id !== item.id || longer[index]?.checksum !== item.checksum)) throw new Error('Migration history was changed or removed.');
  if (longer.slice(shorter.length).some((migration) => migration.destructive)) throw new Error('Contract migrations require a separate reviewed deployment with verified backup evidence.');
}
