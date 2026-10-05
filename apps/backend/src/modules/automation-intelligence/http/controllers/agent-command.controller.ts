import { Context } from 'hono';
import { prisma } from '../../../../lib/prisma.js';
import { AgentCommandAutonomyService } from '../../../../services/agent-command-autonomy.service.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';
import { z } from 'zod';
import { ValidationError } from '../../../../errors/index.js';

const agentService = new AgentCommandAutonomyService(prisma);
const promptSchema = z.object({ prompt: z.string().trim().min(1).max(2000) }).strict();
const planSchema = z.object({ planId: z.string().trim().min(1).max(100) }).strict();
const suggestionSchema = z.object({ suggestionId: z.enum(['SUGG-001', 'SUGG-002']) }).strict();

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await c.req.json<unknown>());
  if (!result.success) throw new ValidationError('Gecersiz istek govdesi.');
  return result.data;
}

export const AgentCommandController = {
  async parsePrompt(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await parseBody(c, promptSchema);

    const data = await agentService.processNaturalLanguageCommand(tenantId, userId, body.prompt);
    return c.json({ data });
  },

  async executePlan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await parseBody(c, planSchema);

    const data = await agentService.executeCommandPlan(tenantId, userId, body.planId);
    return c.json({ data });
  },

  async getWorkflowSuggestions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const data = await agentService.getSelfCorrectingWorkflowSuggestions(tenantId);
    return c.json({ data });
  },

  async adoptSuggestion(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await parseBody(c, suggestionSchema);

    const data = await agentService.adoptWorkflowSuggestion(tenantId, userId, body.suggestionId);
    return c.json({ data });
  },
};
