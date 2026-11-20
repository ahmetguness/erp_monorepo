import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
interface Notification {
  status: string;
  name: string;
  severity: string;
  service: string;
  at: string;
}
const notifications: Notification[] = [];
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid notification");
  return Object.fromEntries(Object.entries(value));
}
createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/alerts") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(notifications));
    return;
  }
  if (request.method === "GET" && request.url === "/metrics") {
    try {
      const metrics = await readFile("/run/axon/metrics.prom", "utf8");
      if (metrics.length > 16384)
        throw new Error("Oversized probe");
      response.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(metrics);
    }
    catch {
      response.writeHead(503);
      response.end();
    }
    return;
  }
  if (request.method !== "POST" || request.url !== "/alerts") {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const value of request) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      bytes += chunk.length;
      if (bytes > 128000)
        throw new Error("Oversized notification");
      chunks.push(chunk);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const alerts = record(body).alerts;
    if (!Array.isArray(alerts))
      throw new Error("Invalid notification");
    for (const item of alerts) {
      const alert = record(item), labels = record(alert.labels);
      if (!["firing", "resolved"].includes(String(alert.status)) ||
        typeof labels.alertname !== "string" ||
        typeof labels.severity !== "string" ||
        typeof labels.service !== "string")
        throw new Error("Invalid notification");
      notifications.push({
        status: String(alert.status),
        name: labels.alertname,
        severity: labels.severity,
        service: labels.service,
        at: new Date().toISOString(),
      });
    }
    notifications.splice(0, Math.max(0, notifications.length - 500));
    response.writeHead(204);
    response.end();
  }
  catch {
    response.writeHead(400);
    response.end();
  }
}).listen(9002, "0.0.0.0");
