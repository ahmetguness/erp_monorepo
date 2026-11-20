import { z } from 'zod';
const keyIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const previousKeysSchema = z.record(keyIdSchema, z.string().min(32).max(4096)).refine(keys => Object.keys(keys).length <= 4);
export function activeEncryptionKeyMaterial(): string {
  const material = process.env.ENCRYPTION_KEY;
  if (!material)
    throw new Error('ENCRYPTION_KEY environment variable is required.');
  return material;
}
export function activeEncryptionKeyId(): string | undefined {
  if (!process.env.ENCRYPTION_KEY_ID)
    return undefined;
  const id = keyIdSchema.safeParse(process.env.ENCRYPTION_KEY_ID);
  if (!id.success || id.data === 'legacy' || (process.env.ENCRYPTION_KEY?.length ?? 0) < 32)
    throw new Error('Encryption key configuration is invalid.');
  return id.data;
}
export function encryptionKeyMaterial(id?: string): string {
  const current = process.env.ENCRYPTION_KEY;
  if (!current)
    throw new Error('ENCRYPTION_KEY environment variable is required.');
  const active = activeEncryptionKeyId();
  if (id && id === active)
    return current;
  let raw: unknown;
  try {
    raw = JSON.parse(process.env.ENCRYPTION_PREVIOUS_KEYS ?? '{}');
  }
  catch {
    throw new Error('Encryption keyring configuration is invalid.');
  }
  const keys = previousKeysSchema.safeParse(raw);
  if (!keys.success)
    throw new Error('Encryption keyring configuration is invalid.');
  if (!id)
    return keys.data.legacy ?? current;
  const previous = keys.data[id];
  if (!previous)
    throw new Error('Encryption key is unavailable.');
  return previous;
}
