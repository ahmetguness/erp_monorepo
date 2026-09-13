import type { Context } from 'hono';
import { requireTenantId } from '../../../../../utils/context.js';
import { getPilotReadiness } from '../../composition.js';

export const PilotReadinessController = {
  async get(c: Context): Promise<Response> {
    const report = await getPilotReadiness(requireTenantId(c));
    return c.json({ data: report });
  },
};
