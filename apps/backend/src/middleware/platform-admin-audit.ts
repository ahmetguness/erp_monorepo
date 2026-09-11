import { Prisma } from "@prisma/client";
import type { MiddlewareHandler } from "hono";
import { createPlatformAudit } from "../modules/platform/index.js";
import { getTrustedClientIpOrNull } from "../utils/request-ip.js";

const sensitiveKey = /(password|secret|token|authorization|api[-_]?key|otp|code)/i;
function safeJson(value: unknown, key = ""): Prisma.InputJsonValue | null {
  if (sensitiveKey.test(key)) return "***MASKED***";
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map((item) => safeJson(item, key));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, safeJson(item, childKey)]));
  return String(value);
}
function target(path: string): { module: string; targetType: string; targetId: string | null } {
  const parts = path.split("/").filter(Boolean); const adminIndex = parts.indexOf("admin");
  const resource = parts[adminIndex + 1] ?? "platform"; const candidate = parts[adminIndex + 2] ?? null;
  return { module: resource.toUpperCase().replaceAll("-", "_"), targetType: resource, targetId: candidate };
}

export const platformAdminAuditMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return next();
  let requestBody: Prisma.InputJsonValue | null | undefined;
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (c.req.header("content-type")?.includes("application/json") && contentLength <= 65536) {
    try { requestBody = safeJson(await c.req.raw.clone().json()); } catch { requestBody = undefined; }
  }
  const bodyField = (field: string): string | null => {
    if (requestBody === null || typeof requestBody !== "object" || Array.isArray(requestBody)) return null;
    const value = Object.entries(requestBody).find(([key]) => key === field)?.[1];
    return typeof value === "string" ? value : null;
  };
  const bodyReason = bodyField("reason");
  const bodyApprovalId = bodyField("approvalId");
  const recordOutcome = async (outcome: "SUCCESS" | "DENIED" | "FAILED", status: number) => {
    const actorId = c.get("adminId") as string | undefined;
    if (!actorId) return;
    await createPlatformAudit({
      actorId, action: method, ...target(c.req.path), outcome,
      reason: c.req.header("x-change-reason") ?? bodyReason, approvalId: c.req.header("x-approval-id") ?? bodyApprovalId,
      ipAddress: getTrustedClientIpOrNull(c), device: c.req.header("user-agent") ?? null,
      requestId: c.get("requestId") as string | undefined ?? c.req.header("x-request-id") ?? null,
      correlationId: c.req.header("x-correlation-id") ?? null,
      beforeValues: { request: null }, afterValues: requestBody === undefined ? { request: "[not-json]", status } : { request: requestBody, status },
    });
  };
  try {
    await next();
  } catch (error: unknown) {
    await recordOutcome("FAILED", 500);
    throw error;
  }
  const status = c.res.status;
  await recordOutcome(status < 400 ? "SUCCESS" : status === 401 || status === 403 ? "DENIED" : "FAILED", status);
};
