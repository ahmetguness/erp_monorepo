import type { Context } from 'hono';
import { resolveContextualFormPolicy, type ContextualFormKind } from '../../application/contextual-forms/index.js';

function policyResponse(c: Context, formKind: ContextualFormKind): Response {
  return c.json({ data: resolveContextualFormPolicy(formKind, c.req.query('context')) });
}

export const ContextualFormController = {
  async invoicePolicy(c: Context): Promise<Response> { return policyResponse(c, 'invoice'); },
  async contactPolicy(c: Context): Promise<Response> { return policyResponse(c, 'contact'); },
  async productPolicy(c: Context): Promise<Response> { return policyResponse(c, 'product'); },
};
