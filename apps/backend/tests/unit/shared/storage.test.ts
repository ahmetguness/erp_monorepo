import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enforceFileSecurity, LocalObjectStorage } from '../../../src/modules/shared/index.js';
import { persistWithObject } from '../../../src/modules/shared/application/storage/persist-object.js';
import { validateObjectKey } from '../../../src/modules/shared/domain/storage/object-key.js';
import type { ObjectStorage, SignedObjectUrl, StoredObject, StoredObjectInput } from '../../../src/modules/shared/domain/storage/object-storage.js';
import { S3CompatibleObjectStorage } from '../../../src/modules/shared/infrastructure/storage/s3-compatible-storage.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('object storage security', () => {
  it('rejects traversal keys', () => {
    expect(() => validateObjectKey('../secret')).toThrow();
    expect(() => validateObjectKey('tenant/../../secret')).toThrow();
  });

  it('round-trips tenant-scoped objects with the local development driver', async () => {
    const root = await mkdtemp(join(tmpdir(), 'axon-storage-'));
    temporaryDirectories.push(root);
    const storage = new LocalObjectStorage(root, true);
    await storage.put({ key: 'tenant-1/file.txt', body: Buffer.from('safe'), contentType: 'text/plain' });
    expect((await storage.get('tenant-1/file.txt'))?.body.toString()).toBe('safe');
  });

  it('rejects content that does not match its declared MIME type', async () => {
    await expect(enforceFileSecurity({
      body: Buffer.from('not a pdf'),
      fileName: 'invoice.pdf',
      contentType: 'application/pdf',
    })).rejects.toThrow('MIME');
  });

  it('rejects a fake WebP logo', async () => {
    await expect(enforceFileSecurity({
      body: Buffer.from('not a webp'),
      fileName: 'logo.webp',
      contentType: 'image/webp',
    })).rejects.toThrow('MIME');
  });

  it('removes an object when metadata persistence fails', async () => {
    const calls: string[] = [];
    const storage: ObjectStorage = {
      driver: 'local',
      put: async (input: StoredObjectInput): Promise<void> => { calls.push(`put:${input.key}`); },
      get: async (_key: string): Promise<StoredObject | null> => null,
      delete: async (key: string): Promise<void> => { calls.push(`delete:${key}`); },
      createSignedGetUrl: async (_key: string, _ttl: number): Promise<SignedObjectUrl | null> => null,
    };
    await expect(persistWithObject(storage, {
      key: 'tenant-1/file.txt', body: Buffer.from('safe'), contentType: 'text/plain',
    }, async () => { throw new Error('database failed'); })).rejects.toThrow('database failed');
    expect(calls).toEqual(['put:tenant-1/file.txt', 'delete:tenant-1/file.txt']);
  });

  it('creates a short-lived S3 URL without leaking the secret', async () => {
    const storage = new S3CompatibleObjectStorage({
      endpoint: 'https://objects.example.com', region: 'eu-central-1',
      accessKeyId: 'access-key', secretAccessKey: 'do-not-leak', bucket: 'uploads',
    });
    const signed = await storage.createSignedGetUrl('tenant-1/invoice 1.pdf', 300);
    expect(signed.url).toContain('/uploads/tenant-1/invoice%201.pdf?');
    expect(signed.url).toContain('X-Amz-Signature=');
    expect(signed.url).not.toContain('do-not-leak');
  });
});
