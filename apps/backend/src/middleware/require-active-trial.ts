import type { MiddlewareHandler } from 'hono';
import { getAccessContext } from './access-context.js';

const CHECKOUT_PATH_PREFIX = '/api/checkout';
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireActiveTrial: MiddlewareHandler = async (context, next) => {
  const access = getAccessContext(context);
  if (!access) return context.json({ error: { code: 'UNAUTHORIZED', message: 'Oturum bilgisi bulunamadı.' } }, 401);
  const expired = access.tenant.status === 'TRIAL'
    && access.tenant.trialEndsAt !== null
    && access.tenant.trialEndsAt.getTime() <= Date.now();
  const isCheckoutRequest = context.req.path.startsWith(CHECKOUT_PATH_PREFIX);
  const isReadOnlyRequest = READ_ONLY_METHODS.has(context.req.method.toUpperCase());
  if (expired && !isCheckoutRequest && !isReadOnlyRequest) {
    return context.json({ error: { code: 'TRIAL_EXPIRED', message: 'Demo süreniz doldu. İşlem yapmak için tam sürüme geçin.' } }, 403);
  }
  await next();
};
