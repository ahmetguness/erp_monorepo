import { useAuthStore } from '@/store/auth.store';
import { MutationIntentRegistry } from './mutation-intent';
import { tenantSessionRevision } from './tenant-session';
let registry: MutationIntentRegistry | undefined;
export function protectedMutation<T>(endpoint: string, input: object & {
  idempotencyKey?: string;
}, send: (key: string, revision: number) => Promise<T>): Promise<T> {
  const { tenant, user } = useAuthStore.getState();
  if (!tenant || !user || typeof window === 'undefined')
    return Promise.reject({ error: { code: 'UNAUTHORIZED', message: 'İşlem için güncel tenant oturumu gerekli.' } });
  // Accessing storage may itself be denied by browser policy.
  if (!registry)
    registry = new MutationIntentRegistry({ getItem: key => window.sessionStorage.getItem(key), setItem: (key, value) => window.sessionStorage.setItem(key, value) });
  const revision = tenantSessionRevision();
  return registry.execute(JSON.stringify([tenant.id, user.id]), endpoint, input, key => {
    if (revision !== tenantSessionRevision())
      return Promise.reject({ error: { code: 'MUTATION_RECOVERY_REQUIRED', message: 'Oturum değişti; eski işlem gönderilmedi.' } });
    return send(key, revision);
  });
}
