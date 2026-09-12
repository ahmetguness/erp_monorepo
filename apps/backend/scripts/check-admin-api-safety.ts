import "dotenv/config";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { prisma } from "../src/lib/prisma.js";
import { adminIdempotency } from "../src/middleware/admin-idempotency.js";
import {
  claimAdminRequest,
  completeAdminRequest,
} from "../src/modules/platform/admin-api-safety/admin-idempotency.service.js";
import { tenantSettingsUpdateSchema } from "../src/modules/platform/admin-api-safety/admin-api-safety.schemas.js";

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  assert.ok(admin, "API güvenlik testi için aktif admin gerekli.");
  const key = `contract:${Date.now()}`;
  const tenant = await prisma.tenant.create({
    data: {
      slug: `api-safety-${Date.now()}`,
      companyName: "API Safety Test",
      email: `api-safety-${Date.now()}@example.test`,
    },
    select: { id: true, updatedAt: true },
  });
  const base = {
    adminId: admin.id,
    method: "PATCH",
    path: "/api/admin/test",
    key,
  };
  try {
    const first = await claimAdminRequest({ ...base, requestHash: "hash-a" });
    assert.equal(first.kind, "CLAIMED");
    if (first.kind !== "CLAIMED") return;
    assert.equal(
      (await claimAdminRequest({ ...base, requestHash: "hash-a" })).kind,
      "PROCESSING",
    );
    await completeAdminRequest(first.id, {
      statusCode: 200,
      contentType: "application/json",
      responseBody: '{"data":{"ok":true}}',
    });
    const replay = await claimAdminRequest({ ...base, requestHash: "hash-a" });
    assert.equal(replay.kind, "REPLAY");
    assert.equal(
      (await claimAdminRequest({ ...base, requestHash: "hash-b" })).kind,
      "CONFLICT",
    );
    assert.equal(
      tenantSettingsUpdateSchema.safeParse({
        expectedUpdatedAt: new Date().toISOString(),
        notify: false,
      }).success,
      true,
    );
    assert.equal(
      tenantSettingsUpdateSchema.safeParse({ notify: false }).success,
      false,
    );
    const firstUpdate = await prisma.tenant.updateMany({
      where: { id: tenant.id, updatedAt: tenant.updatedAt },
      data: { notes: "first writer" },
    });
    const staleUpdate = await prisma.tenant.updateMany({
      where: { id: tenant.id, updatedAt: tenant.updatedAt },
      data: { notes: "stale writer" },
    });
    assert.equal(firstUpdate.count, 1);
    assert.equal(staleUpdate.count, 0);
    const app = new Hono();
    let executions = 0;
    app.use("*", async (c, next) => {
      c.set("adminId", admin.id);
      await next();
    });
    app.use("*", adminIdempotency);
    app.post("/mutation", async (c) => {
      executions += 1;
      return c.json({ data: await c.req.json() });
    });
    app.delete("/mutation", (c) => {
      executions += 1;
      return c.body(null, 204);
    });
    const httpKey = `${key}:http`;
    const headers = { "content-type": "application/json", "idempotency-key": httpKey };
    const firstResponse = await app.request("/mutation", { method: "POST", headers, body: '{"value":1}' });
    const replayResponse = await app.request("/mutation", { method: "POST", headers, body: '{"value":1}' });
    const conflictResponse = await app.request("/mutation", { method: "POST", headers, body: '{"value":2}' });
    const missingKeyResponse = await app.request("/mutation", { method: "POST", headers: { "content-type": "application/json" }, body: '{"value":1}' });
    const invalidBodyResponse = await app.request("/mutation", { method: "POST", headers: { ...headers, "idempotency-key": `${httpKey}:invalid` }, body: "[]" });
    const deleteHeaders = { "idempotency-key": `${httpKey}:delete` };
    const deleteResponse = await app.request("/mutation", { method: "DELETE", headers: deleteHeaders });
    const deleteReplay = await app.request("/mutation", { method: "DELETE", headers: deleteHeaders });
    assert.equal(firstResponse.status, 200);
    assert.equal(replayResponse.headers.get("idempotency-replayed"), "true");
    assert.equal(conflictResponse.status, 409);
    assert.equal(missingKeyResponse.status, 400);
    assert.equal(invalidBodyResponse.status, 400);
    assert.equal(deleteResponse.status, 204);
    assert.equal(deleteReplay.status, 204);
    assert.equal(deleteReplay.headers.get("idempotency-replayed"), "true");
    assert.equal(executions, 2);
    const failingApp = new Hono();
    failingApp.use("*", async (c, next) => { c.set("adminId", admin.id); await next(); });
    failingApp.use("*", adminIdempotency);
    failingApp.use("*", async (_c, next) => { await next(); throw new Error("audit failure"); });
    failingApp.post("/mutation", (c) => c.json({ data: true }));
    failingApp.onError((_error, c) => c.json({ error: { code: "TEST_FAILURE", message: "failure" } }, 500));
    const failingKey = `${httpKey}:failure`;
    const failingResponse = await failingApp.request("/mutation", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": failingKey }, body: "{}" });
    assert.equal(failingResponse.status, 500);
    assert.equal(await prisma.adminIdempotencyRecord.count({ where: { adminId: admin.id, key: failingKey } }), 0);
  } finally {
    await prisma.adminIdempotencyRecord.deleteMany({ where: { adminId: admin.id, key: { startsWith: key } } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
  console.log(
    "Admin API safety integration: OK (claim, in-flight, replay, conflict, concurrency contract)",
  );
}
main().finally(() => prisma.$disconnect());
