import { getObjectStorage, getObjectStorageStatus, type ObjectStorage, type StorageStatus } from '../modules/shared/index.js';

export type {
  ObjectStorage,
  SignedObjectUrl,
  StorageDriver,
  StorageStatus,
  StoredObject,
  StoredObjectInput,
} from '../modules/shared/index.js';

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

export const storageService: ObjectStorage = {
  get driver() { return getObjectStorage().driver; },
  put(input) { return getObjectStorage().put(input); },
  get(key) { return getObjectStorage().get(key); },
  delete(key) { return getObjectStorage().delete(key); },
  createSignedGetUrl(key, expiresInSeconds) { return getObjectStorage().createSignedGetUrl(key, expiresInSeconds); },
};

export function getStorageStatus(): StorageStatus {
  return getObjectStorageStatus();
}
