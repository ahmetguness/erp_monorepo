export type StorageDriver = 'local' | 's3';

export interface StoredObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StoredObject {
  body: Buffer;
  contentType: string;
  contentLength: number;
}

export interface SignedObjectUrl {
  url: string;
  expiresAt: Date;
}

export interface ObjectStorage {
  readonly driver: StorageDriver;
  put(input: StoredObjectInput): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  createSignedGetUrl(key: string, expiresInSeconds: number): Promise<SignedObjectUrl | null>;
}

export interface StorageStatus {
  driver: StorageDriver;
  ready: boolean;
  missing: string[];
  productionLocalAllowed: boolean;
  legacyLocalReadEnabled: boolean;
  signedUrlsSupported: boolean;
}
