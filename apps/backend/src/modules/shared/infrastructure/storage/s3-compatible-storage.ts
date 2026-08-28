import { ValidationError } from '../../../../errors/index.js';
import { observedFetch } from '../observability/observed-fetch.js';
import type { ObjectStorage, SignedObjectUrl, StoredObject, StoredObjectInput } from '../../domain/storage/object-storage.js';
import { encodeObjectKey, validateObjectKey } from '../../domain/storage/object-key.js';
import { amzDate, hashHex, hmacHex, signingKey } from './aws-signature-v4.js';

export interface S3CompatibleConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function bufferToBlob(buffer: Buffer): Blob {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return new Blob([bytes]);
}

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  readonly driver = 's3' as const;
  private readonly endpoint: string;

  constructor(private readonly config: S3CompatibleConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
  }

  async put(input: StoredObjectInput): Promise<void> {
    const response = await this.request('PUT', input.key, input.body, input.contentType);
    if (!response.ok) throw new ValidationError(`Object storage yükleme başarısız: HTTP ${response.status}.`);
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.request('GET', key);
    if (response.status === 404) return null;
    if (!response.ok) throw new ValidationError(`Object storage okuma başarısız: HTTP ${response.status}.`);
    const body = Buffer.from(await response.arrayBuffer());
    return {
      body,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: body.length,
    };
  }

  async delete(key: string): Promise<void> {
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) throw new ValidationError(`Object storage silme başarısız: HTTP ${response.status}.`);
  }

  async createSignedGetUrl(key: string, expiresInSeconds: number): Promise<SignedObjectUrl> {
    const expires = Math.min(3_600, Math.max(30, Math.trunc(expiresInSeconds)));
    const now = new Date();
    const { dateStamp, value: dateValue } = amzDate(now);
    const service = 's3';
    const scope = `${dateStamp}/${this.config.region}/${service}/aws4_request`;
    const host = new URL(this.endpoint).host;
    const canonicalUri = this.objectPath(key);
    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${scope}`,
      'X-Amz-Date': dateValue,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    });
    const canonicalQuery = Array.from(query.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${encodeQueryValue(name)}=${encodeQueryValue(value)}`)
      .join('&');
    const canonicalRequest = ['GET', canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', dateValue, scope, hashHex(canonicalRequest)].join('\n');
    const signature = hmacHex(signingKey(this.config.secretAccessKey, dateStamp, this.config.region, service), stringToSign);
    return {
      url: `${this.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      expiresAt: new Date(now.getTime() + expires * 1_000),
    };
  }

  private objectPath(key: string): string {
    return `/${encodeQueryValue(this.config.bucket)}/${encodeObjectKey(validateObjectKey(key))}`;
  }

  private async request(method: 'PUT' | 'GET' | 'DELETE', rawKey: string, body?: Buffer, contentType?: string): Promise<Response> {
    const now = new Date();
    const { dateStamp, value: dateValue } = amzDate(now);
    const service = 's3';
    const scope = `${dateStamp}/${this.config.region}/${service}/aws4_request`;
    const host = new URL(this.endpoint).host;
    const canonicalUri = this.objectPath(rawKey);
    const payloadHash = hashHex(body ?? '');
    const headers = new Headers({ host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': dateValue });
    if (contentType) headers.set('content-type', contentType);
    const signedHeaders = Array.from(headers.keys()).sort().join(';');
    const canonicalHeaders = Array.from(headers.keys()).sort().map((name) => `${name}:${headers.get(name)?.trim() ?? ''}\n`).join('');
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', dateValue, scope, hashHex(canonicalRequest)].join('\n');
    const signature = hmacHex(signingKey(this.config.secretAccessKey, dateStamp, this.config.region, service), stringToSign);
    headers.set('authorization', `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
    return observedFetch(`${this.endpoint}${canonicalUri}`, { method, headers, body: body ? bufferToBlob(body) : undefined });
  }
}
