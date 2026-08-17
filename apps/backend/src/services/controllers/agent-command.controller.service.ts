import { Context } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireUserId } from '../../utils/context.js';
import { AgentCommandAutonomyService } from '../agent-command-autonomy.service.js';

const agentService = new AgentCommandAutonomyService(prisma);

export const AgentCommandController = {
  async parsePrompt(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ prompt: string }>();

    const data = await agentService.processNaturalLanguageCommand(tenantId, userId, body.prompt);
    return c.json({ data });
  },

  async executePlan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ planId: string }>();

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
    const body = await c.req.json<{ suggestionId: string }>();

    const data = await agentService.adoptWorkflowSuggestion(tenantId, userId, body.suggestionId);
    return c.json({ data });
  },
};
