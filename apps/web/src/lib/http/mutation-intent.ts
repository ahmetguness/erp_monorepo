import { z } from 'zod';
import { ApiErrorSchema } from '@repo/types/contracts';
const intentSchema = z.object({ namespace: z.string().regex(/^[a-f0-9]{64}$/), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), key: z.string().min(8).max(160) }).strict();
const storedSchema = z.array(intentSchema).max(32);
const STORAGE_KEY = 'axon-mutation-intents-v1';
interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const failure = (code: string, message: string) => ({ error: { code, message } });
function canonical(value: unknown): string {
  if (value === undefined)
    return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object')
    return '{' + Object.entries(value).filter(([key, item]) => key !== 'idempotencyKey' && item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  throw failure('VALIDATION_ERROR', 'İşlem verisi geçerli JSON olmalı.');
}
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const definitive = new Set(['VALIDATION_ERROR', 'FORBIDDEN', 'UNAUTHORIZED', 'NOT_FOUND', 'FEATURE_DISABLED', 'MODULE_DISABLED', 'LIMIT_EXCEEDED', 'TRIAL_EXPIRED']);
/** Stores only hashes and random intent keys, never payment/stock payloads or tokens. */
export class MutationIntentRegistry {
  private readonly active = new Set<string>();
  constructor(private readonly storage: Storage) { }
  private read() {
    try {
      return storedSchema.parse(JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '[]'));
    }
    catch {
      throw failure('MUTATION_RECOVERY_REQUIRED', 'İşlem anahtarı doğrulanamadı. Önce önceki işlemin sonucunu kontrol edin.');
    }
  }
  private write(rows: z.infer<typeof storedSchema>): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }
    catch {
      throw failure('MUTATION_RECOVERY_REQUIRED', 'Güvenli tekrar gönderim için tarayıcı oturum depolaması gerekli.');
    }
  }
  async execute<Input extends object, Result>(identity: string, endpoint: string, input: Input & {
    idempotencyKey?: string;
  }, send: (key: string) => Promise<Result>): Promise<Result> {
    const encoded = canonical(input);
    if (encoded.length > 524288)
      throw failure('VALIDATION_ERROR', 'İşlem verisi çok büyük.');
    const [namespace, fingerprint] = await Promise.all([hash(identity + '\n' + endpoint), hash(encoded)]);
    if (this.active.has(namespace))
      throw failure('MUTATION_IN_PROGRESS', 'Bu işlem zaten gönderiliyor. Sonucu bekleyin.');
    const rows = this.read();
    const previous = rows.find(row => row.namespace === namespace);
    // A remounted form may mint a new local key. The persisted ambiguous intent
    // owns its original key; identical payload retries must keep using it.
    if (previous && previous.fingerprint !== fingerprint)
      throw failure('MUTATION_RECOVERY_REQUIRED', 'Önceki işlemin sonucu belirsiz. Önce sonucu kontrol edin veya aynı verilerle yeniden deneyin.');
    const key = previous?.key ?? input.idempotencyKey ?? crypto.randomUUID();
    if (!intentSchema.safeParse({ namespace, fingerprint, key }).success)
      throw failure('VALIDATION_ERROR', 'İşlem anahtarı geçersiz.');
    if (!previous) {
      if (rows.length >= 32)
        throw failure('MUTATION_RECOVERY_REQUIRED', 'Bekleyen işlem anahtarı sınırına ulaşıldı; önce belirsiz işlemleri kontrol edin.');
      this.write([...rows, { namespace, fingerprint, key }]);
    }
    this.active.add(namespace);
    const remove = () => this.write(this.read().filter(row => row.namespace !== namespace));
    try {
      const result = await send(key);
      remove();
      return result;
    }
    catch (error) {
      const parsed = ApiErrorSchema.safeParse(error);
      if (parsed.success && definitive.has(parsed.data.error.code))
        remove();
      throw error;
    }
    finally {
      this.active.delete(namespace);
    }
  }
}
