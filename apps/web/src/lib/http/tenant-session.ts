import { useAuthStore } from '@/store/auth.store';
const identity = (state: ReturnType<typeof useAuthStore.getState>) => JSON.stringify([state.tenant?.id, state.user?.id, state.sessionVersion]);
let revision = 0;
useAuthStore.subscribe((state, previous) => {
  if (identity(state) !== identity(previous))
    revision++;
});
export const tenantSessionRevision = () => revision;
export const subscribeTenantSession = (changed: () => void) => useAuthStore.subscribe((state, previous) => {
  if (identity(state) !== identity(previous))
    changed();
});
