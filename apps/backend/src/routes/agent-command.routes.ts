import { Hono } from "hono";
import { AgentCommandController } from "../modules/automation-intelligence/http/controllers/index.js";
import { ACCESS_POLICIES } from "@repo/types/plans";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";

const agentCommandRoutes = new Hono();

agentCommandRoutes.use("*", requireAccess(ACCESS_POLICIES.workflowAutomation));

agentCommandRoutes.post("/parse-prompt", requirePermission("settings", "READ"), AgentCommandController.parsePrompt);
agentCommandRoutes.post("/execute-plan", requirePermission("settings", "UPDATE"), AgentCommandController.executePlan);
agentCommandRoutes.get(
  "/workflow-suggestions",
  requirePermission("settings", "READ"),
  AgentCommandController.getWorkflowSuggestions,
);
agentCommandRoutes.post(
  "/adopt-suggestion",
  requirePermission("settings", "CREATE"),
  AgentCommandController.adoptSuggestion,
);

export { agentCommandRoutes };
