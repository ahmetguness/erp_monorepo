import type { ObjectStorage, StoredObjectInput } from '../../domain/storage/object-storage.js';

export async function persistWithObject<T>(
  storage: ObjectStorage,
  object: StoredObjectInput,
  persistMetadata: () => Promise<T>,
): Promise<T> {
  await storage.put(object);
  try {
    return await persistMetadata();
  } catch (error) {
    await storage.delete(object.key).catch(() => undefined);
    throw error;
  }
}
