import { resolve } from 'node:path';
import { ValidationError } from '../../../../errors/index.js';
import type { ObjectStorage, SignedObjectUrl, StorageDriver, StorageStatus, StoredObject, StoredObjectInput } from '../../domain/storage/object-storage.js';
import { LocalObjectStorage } from './local-storage.js';
import { S3CompatibleObjectStorage, type S3CompatibleConfig } from './s3-compatible-storage.js';

const isProduction = process.env.NODE_ENV === 'production';

function selectedDriver(): StorageDriver {
  const value = process.env.STORAGE_DRIVER?.toLowerCase();
  if (value === 's3' || value === 'r2') return 's3';
  if (value === 'local') return 'local';
  return isProduction ? 's3' : 'local';
}

function firstEnv(...names: string[]): string | undefined {
  return names.map((name) => process.env[name]?.trim()).find(Boolean);
}

function s3Config(): { config: S3CompatibleConfig | null; missing: string[] } {
  const endpoint = firstEnv('S3_ENDPOINT', 'R2_ENDPOINT')
    ?? (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  const values = {
    endpoint,
    region: firstEnv('S3_REGION') ?? 'auto',
    accessKeyId: firstEnv('S3_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID'),
    secretAccessKey: firstEnv('S3_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY'),
    bucket: firstEnv('S3_BUCKET', 'R2_BUCKET'),
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
  return missing.length === 0 ? { config: values as S3CompatibleConfig, missing } : { config: null, missing };
}

class LegacyFallbackStorage implements ObjectStorage {
  readonly driver = 's3' as const;
  constructor(private readonly primary: ObjectStorage, private readonly legacy: ObjectStorage) {}
  put(input: StoredObjectInput): Promise<void> { return this.primary.put(input); }
  async get(key: string): Promise<StoredObject | null> { return (await this.primary.get(key)) ?? this.legacy.get(key); }
  async delete(key: string): Promise<void> {
    await this.primary.delete(key);
    await this.legacy.delete(key);
  }
  createSignedGetUrl(_key: string, _expiresInSeconds: number): Promise<SignedObjectUrl | null> {
    // A legacy object may exist only on local disk. Keep downloads on the
    // authenticated proxy until migration is complete to avoid false 404s.
    return Promise.resolve(null);
  }
}

let singleton: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (singleton) return singleton;
  const local = new LocalObjectStorage(resolve(process.cwd(), 'uploads'), !isProduction || process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION === 'true');
  if (selectedDriver() === 'local') return (singleton = local);
  const resolved = s3Config();
  if (!resolved.config) throw new ValidationError(`Object storage yapılandırması eksik: ${resolved.missing.join(', ')}.`);
  const s3 = new S3CompatibleObjectStorage(resolved.config);
  singleton = process.env.STORAGE_LEGACY_LOCAL_READ === 'true' ? new LegacyFallbackStorage(s3, local) : s3;
  return singleton;
}

export function createPrimaryObjectStorage(): ObjectStorage {
  const resolved = s3Config();
  if (!resolved.config) throw new ValidationError(`Object storage yapılandırması eksik: ${resolved.missing.join(', ')}.`);
  return new S3CompatibleObjectStorage(resolved.config);
}

export function getStorageStatus(): StorageStatus {
  const driver = selectedDriver();
  const config = s3Config();
  const localAllowed = isProduction && process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION === 'true';
  return {
    driver,
    ready: driver === 's3' ? config.missing.length === 0 : !isProduction || localAllowed,
    missing: driver === 's3' ? config.missing : [],
    productionLocalAllowed: localAllowed,
    legacyLocalReadEnabled: driver === 's3' && process.env.STORAGE_LEGACY_LOCAL_READ === 'true',
    signedUrlsSupported: driver === 's3' && config.missing.length === 0,
  };
}
