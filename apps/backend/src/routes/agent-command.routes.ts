import { Hono } from 'hono';
import { AgentCommandController } from '../services/controllers/agent-command.controller.service.js';

const agentCommandRoutes = new Hono();

agentCommandRoutes.post('/parse-prompt', AgentCommandController.parsePrompt);
agentCommandRoutes.post('/execute-plan', AgentCommandController.executePlan);
agentCommandRoutes.get('/workflow-suggestions', AgentCommandController.getWorkflowSuggestions);
agentCommandRoutes.post('/adopt-suggestion', AgentCommandController.adoptSuggestion);

export { agentCommandRoutes };
