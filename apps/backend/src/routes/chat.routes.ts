import { ACCESS_POLICIES } from "@repo/types/plans";
import { Hono } from "hono";
import { requireAccess } from "../middleware/requireAccess";
import { requirePermission } from "../middleware/requirePermission";
import { ChatController } from "../modules/automation-intelligence/http/controllers/index.js";

export const chatRoutes = new Hono();

// Scope the AI policy to its handlers; collaboration shares the /chat prefix.

chatRoutes.post("/", requireAccess(ACCESS_POLICIES.chat), requirePermission("chat", "CREATE"), ChatController.send);
chatRoutes.post(
  "/stream",
  requireAccess(ACCESS_POLICIES.chat),
  requirePermission("chat", "CREATE"),
  ChatController.sendStream,
);
chatRoutes.delete(
  "/history",
  requireAccess(ACCESS_POLICIES.chat),
  requirePermission("chat", "DELETE"),
  ChatController.clear,
);
