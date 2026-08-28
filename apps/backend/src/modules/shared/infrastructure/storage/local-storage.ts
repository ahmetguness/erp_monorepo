import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { ValidationError } from '../../../../errors/index.js';
import type { ObjectStorage, SignedObjectUrl, StoredObject, StoredObjectInput } from '../../domain/storage/object-storage.js';
import { validateObjectKey } from '../../domain/storage/object-key.js';

export class LocalObjectStorage implements ObjectStorage {
  readonly driver = 'local' as const;

  constructor(private readonly rootDirectory: string, private readonly writeAllowed: boolean) {}

  async put(input: StoredObjectInput): Promise<void> {
    if (!this.writeAllowed) throw new ValidationError('Production ortamında local dosya yükleme kapalı. S3-compatible storage yapılandırın.');
    const filePath = this.resolvePath(input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body, { flag: 'wx' });
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const body = await readFile(this.resolvePath(key));
      return { body, contentType: 'application/octet-stream', contentLength: body.length };
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : null;
      if (code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : null;
      if (code !== 'ENOENT') throw error;
    }
  }

  async createSignedGetUrl(_key: string, _expiresInSeconds: number): Promise<SignedObjectUrl | null> {
    return null;
  }

  private resolvePath(key: string): string {
    const root = resolve(this.rootDirectory);
    const filePath = resolve(root, validateObjectKey(key));
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw new ValidationError('Geçersiz dosya yolu.');
    return filePath;
  }
}
