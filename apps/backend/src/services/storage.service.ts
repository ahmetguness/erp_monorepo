import { createHash, createHmac } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { ValidationError } from '../errors';

type StorageDriver = 'local' | 'r2';

interface StoredObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

interface StoredObject {
  body: Buffer;
  contentType: string;
  contentLength: number;
}

interface ObjectStorage {
  driver: StorageDriver;
  put(input: StoredObjectInput): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

interface R2Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

interface StorageStatus {
  driver: StorageDriver;
  ready: boolean;
  missing: string[];
  productionLocalAllowed: boolean;
}

const UPLOAD_DIR = resolve(process.cwd(), 'uploads');
const STORAGE_DRIVER_ENV = process.env.STORAGE_DRIVER?.toLowerCase();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOCAL_UPLOADS_ALLOWED_IN_PRODUCTION = process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION === 'true';

function getStorageDriver(): StorageDriver {
  if (STORAGE_DRIVER_ENV === 'r2') return 'r2';
  if (STORAGE_DRIVER_ENV === 'local') return 'local';
  return IS_PRODUCTION ? 'r2' : 'local';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ValidationError(`${name} ortam değişkeni eksik.`);
  }
  return value;
}

function getR2Config(): R2Config {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    endpoint: endpoint.replace(/\/$/, ''),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requireEnv('R2_BUCKET'),
  };
}

function validateObjectKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) {
    throw new ValidationError('Geçersiz dosya anahtarı.');
  }
  return normalized;
}

function hashHex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function toAmzDate(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    dateStamp: iso.slice(0, 8),
    amzDate: iso,
  };
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(encodePathSegment).join('/');
}

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

function bufferToBlob(buffer: Buffer): Blob {
  return new Blob([bufferToArrayBuffer(buffer)]);
}

class LocalStorage implements ObjectStorage {
  readonly driver = 'local' as const;

  async put(input: StoredObjectInput): Promise<void> {
    if (IS_PRODUCTION && !LOCAL_UPLOADS_ALLOWED_IN_PRODUCTION) {
      throw new ValidationError('Production ortamında local dosya yükleme kapalı. STORAGE_DRIVER=r2 yapılandırın.');
    }

    const key = validateObjectKey(input.key);
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body, { flag: 'wx' });
  }

  async get(key: string): Promise<StoredObject | null> {
    const filePath = this.resolvePath(validateObjectKey(key));
    try {
      const body = await readFile(filePath);
      return {
        body,
        contentType: 'application/octet-stream',
        contentLength: body.length,
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(validateObjectKey(key));
    try {
      await unlink(filePath);
    } catch {
      // Missing objects are treated as already deleted.
    }
  }

  private resolvePath(key: string): string {
    const filePath = resolve(UPLOAD_DIR, key);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      throw new ValidationError('Geçersiz dosya yolu.');
    }
    return filePath;
  }
}

class R2Storage implements ObjectStorage {
  readonly driver = 'r2' as const;
  private readonly config: R2Config;

  constructor(config: R2Config) {
    this.config = config;
  }

  async put(input: StoredObjectInput): Promise<void> {
    const key = validateObjectKey(input.key);
    const response = await this.request('PUT', key, input.body, input.contentType);
    if (!response.ok) {
      throw new ValidationError(`R2 yükleme başarısız: HTTP ${response.status}.`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.request('GET', validateObjectKey(key));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ValidationError(`R2 dosya okuma başarısız: HTTP ${response.status}.`);
    }

    const body = Buffer.from(await response.arrayBuffer());
    return {
      body,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: body.length,
    };
  }

  async delete(key: string): Promise<void> {
    const response = await this.request('DELETE', validateObjectKey(key));
    if (!response.ok && response.status !== 404) {
      throw new ValidationError(`R2 dosya silme başarısız: HTTP ${response.status}.`);
    }
  }

  private async request(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, contentType?: string): Promise<Response> {
    const now = new Date();
    const { dateStamp, amzDate } = toAmzDate(now);
    const region = 'auto';
    const service = 's3';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const host = new URL(this.config.endpoint).host;
    const encodedKey = encodeObjectKey(key);
    const canonicalUri = `/${encodePathSegment(this.config.bucket)}/${encodedKey}`;
    const url = `${this.config.endpoint}${canonicalUri}`;
    const payloadHash = hashHex(body ?? '');
    const headers = new Headers({
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    });

    if (contentType) {
      headers.set('content-type', contentType);
    }

    const signedHeaders = Array.from(headers.keys()).sort().join(';');
    const canonicalHeaders = Array.from(headers.keys())
      .sort()
      .map((name) => `${name}:${headers.get(name)?.trim() ?? ''}\n`)
      .join('');
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      hashHex(canonicalRequest),
    ].join('\n');
    const signingKey = this.getSigningKey(dateStamp, region, service);
    const signature = hmacHex(signingKey, stringToSign);

    headers.set(
      'authorization',
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    );

    return fetch(url, {
      method,
      headers,
      body: body ? bufferToBlob(body) : undefined,
    });
  }

  private getSigningKey(dateStamp: string, region: string, service: string): Buffer {
    const dateKey = hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, service);
    return hmac(serviceKey, 'aws4_request');
  }
}

let objectStorage: ObjectStorage | null = null;

function getObjectStorage(): ObjectStorage {
  if (!objectStorage) {
    objectStorage = getStorageDriver() === 'r2'
      ? new R2Storage(getR2Config())
      : new LocalStorage();
  }
  return objectStorage;
}

export const storageService: ObjectStorage = {
  get driver(): StorageDriver {
    return getObjectStorage().driver;
  },
  put(input: StoredObjectInput): Promise<void> {
    return getObjectStorage().put(input);
  },
  get(key: string): Promise<StoredObject | null> {
    return getObjectStorage().get(key);
  },
  delete(key: string): Promise<void> {
    return getObjectStorage().delete(key);
  },
};

export function getStorageStatus(): StorageStatus {
  const driver = getStorageDriver();
  const missing = driver === 'r2'
    ? ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((key) => !process.env[key])
    : [];

  return {
    driver,
    ready: missing.length === 0 && (driver === 'r2' || !IS_PRODUCTION || LOCAL_UPLOADS_ALLOWED_IN_PRODUCTION),
    missing,
    productionLocalAllowed: IS_PRODUCTION && LOCAL_UPLOADS_ALLOWED_IN_PRODUCTION,
  };
}
