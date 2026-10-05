import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.API_URL ?? "http://localhost:3001";
const origin = "http://localhost:3000";
const marker = `TEST_E2E_APPROVALS_${Date.now()}`;
type Session = { cookie: string };

async function api(session: Session | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { origin, ...(session ? { cookie: session.cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, slug: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password: "demo1234", tenantSlug: slug }) });
  assert.equal(response.status, 200, `${email} login`);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0] };
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "admin@axondemo.com" } });
  const approver = await prisma.user.findUniqueOrThrow({ where: { email: "muhasebe@axondemo.com" } });
  const tenantA = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-a`, companyName: `${marker}_A`, email: `${marker}-a@example.test`, plan: "ENTERPRISE", status: "ACTIVE", modules: [] } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${marker.toLowerCase()}-b`, companyName: `${marker}_B`, email: `${marker}-b@example.test`, plan: "ENTERPRISE", status: "ACTIVE", modules: [] } });
  try {
    const role = await prisma.role.create({ data: { tenantId: tenantA.id, name: `${marker}_APPROVER`, permissions: { create: [{ module: "approvals", action: "READ" }, { module: "approvals", action: "APPROVE" }] } } });
    const foreignRole = await prisma.role.create({ data: { tenantId: tenantB.id, name: `${marker}_FOREIGN` } });
    await prisma.tenantUser.createMany({ data: [
      { tenantId: tenantA.id, userId: owner.id, isOwner: true },
      { tenantId: tenantA.id, userId: approver.id, roleId: role.id },
      { tenantId: tenantB.id, userId: owner.id, isOwner: true },
    ] });
    const a = await login(owner.email, tenantA.slug);
    const b = await login(owner.email, tenantB.slug);
    const delegated = await login(approver.email, tenantA.slug);

    assert.equal((await api(null, "GET", "/api/approvals/flows")).status, 401);
    assert.equal((await api(a, "GET", "/api/approvals/flows?page=x")).status, 400);
    assert.equal((await api(a, "POST", "/api/approvals/flows", { name: " ", module: "OTHER", steps: [{ stepOrder: 1, name: "x" }] })).status, 400);
    assert.equal((await api(a, "POST", "/api/approvals/flows", { name: `${marker}_BAD_ORDER`, module: "OTHER", steps: [{ stepOrder: 2, name: "x" }] })).status, 400);
    assert.equal((await api(a, "POST", "/api/approvals/flows", { name: `${marker}_BAD_RANGE`, module: "OTHER", conditions: { minAmount: 2, maxAmount: 1 }, steps: [{ stepOrder: 1, name: "x" }] })).status, 400);
    assert.equal((await api(a, "POST", "/api/approvals/flows", { name: `${marker}_FOREIGN_ROLE`, module: "OTHER", steps: [{ stepOrder: 1, name: "x", approverRoleId: foreignRole.id }] })).status, 400);

    const flowResponse = await api(a, "POST", "/api/approvals/flows", { name: `${marker}_FLOW`, module: "OTHER", conditions: { minAmount: 100, departments: ["Finans"] }, steps: [{ stepOrder: 1, name: "Finans onayi" }] });
    assert.equal(flowResponse.status, 201);
    const flowId = flowResponse.body.data.id as string;
    const foreignContact = await prisma.contact.create({ data: { tenantId: tenantB.id, type: "CUSTOMER", name: `${marker}_FOREIGN_CONTACT`, code: `${marker}_FC` } });
    assert.equal((await api(b, "GET", `/api/approvals/flows/${flowId}`)).status, 404);
    assert.equal((await api(a, "POST", "/api/approvals/requests", { flowId, entityType: "CONTACT", entityId: foreignContact.id, context: { amount: 100, department: "Finans" } })).status, 404);
    assert.equal((await api(a, "POST", "/api/approvals/requests", { flowId, entityType: "PRODUCT", entityId: "missing-product", context: { amount: 100, department: "Finans" } })).status, 404);
    assert.equal((await api(a, "POST", "/api/approvals/requests", { flowId, entityType: "OTHER", entityId: `${marker}_LOW`, context: { amount: 99, department: "Finans" } })).status, 400);
    assert.equal((await api(a, "POST", "/api/approvals/requests", { flowId, entityType: "OTHER", entityId: `${marker}_NEGATIVE`, context: { amount: -1, department: "Finans" } })).status, 400);
    assert.equal((await api(b, "POST", "/api/approvals/requests", { flowId, entityType: "OTHER", entityId: `${marker}_FOREIGN`, context: { amount: 100, department: "Finans" } })).status, 404);

    const requestPayload = { flowId, entityType: "OTHER", entityId: `${marker}_ENTITY`, requestedBy: approver.id, context: { amount: 125, department: "finans" } };
    const concurrentCreate = await Promise.all([api(a, "POST", "/api/approvals/requests", requestPayload), api(a, "POST", "/api/approvals/requests", requestPayload)]);
    assert.deepEqual(concurrentCreate.map((item) => item.status).sort(), [201, 409]);
    const request = await prisma.approvalRequest.findFirstOrThrow({ where: { tenantId: tenantA.id, flowId, entityId: requestPayload.entityId } });
    assert.equal(request.requestedBy, owner.id, "requestedBy must be server authenticated identity");
    assert.equal(await prisma.approvalRequest.count({ where: { tenantId: tenantA.id, flowId, entityId: requestPayload.entityId, status: "PENDING" } }), 1);
    assert.equal((await api(a, "PATCH", `/api/approvals/flows/${flowId}`, { steps: [{ stepOrder: 1, name: "Degistirilemez" }] })).status, 409);
    assert.equal((await api(a, "DELETE", `/api/approvals/flows/${flowId}`)).status, 409);
    assert.equal((await api(b, "GET", `/api/approvals/requests/${request.id}`)).status, 404);
    assert.equal((await api(a, "POST", `/api/approvals/requests/${request.id}/action`, { actionType: "APPROVE", actorId: approver.id })).status, 400);

    const concurrentDecision = await Promise.all([
      api(a, "POST", `/api/approvals/requests/${request.id}/action`, { actionType: "APPROVE", notes: marker }),
      api(a, "POST", `/api/approvals/requests/${request.id}/action`, { actionType: "REJECT", notes: marker }),
    ]);
    assert.equal(concurrentDecision.filter((item) => item.status === 201).length, 1);
    assert.equal(concurrentDecision.filter((item) => item.status === 409 || item.status === 400).length, 1);
    assert.equal(await prisma.approvalAction.count({ where: { requestId: request.id } }), 1);
    const finalRequest = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.notEqual(finalRequest.status, "PENDING");
    assert.ok(finalRequest.resolvedAt);

    const assignedFlowResponse = await api(a, "POST", "/api/approvals/flows", { name: `${marker}_ASSIGNED`, module: "OTHER", steps: [{ stepOrder: 1, name: "Yetkili", approverRoleId: role.id }] });
    assert.equal(assignedFlowResponse.status, 201);
    const assignedFlowId = assignedFlowResponse.body.data.id as string;
    const assignedRequestResponse = await api(a, "POST", "/api/approvals/requests", { flowId: assignedFlowId, entityType: "OTHER", entityId: `${marker}_ASSIGNED_ENTITY` });
    assert.equal(assignedRequestResponse.status, 201);
    const assignedRequestId = assignedRequestResponse.body.data.id as string;
    assert.equal((await api(a, "POST", `/api/approvals/requests/${assignedRequestId}/action`, { actionType: "APPROVE" })).status, 403);
    assert.equal((await api(delegated, "POST", `/api/approvals/requests/${assignedRequestId}/action`, { actionType: "APPROVE" })).status, 201);
    const assignedAction = await prisma.approvalAction.findFirstOrThrow({ where: { requestId: assignedRequestId } });
    assert.equal(assignedAction.actorId, approver.id);
    assert.ok(assignedAction.stepId);

    const indexRows = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'approval_requests_one_pending_per_flow_entity'`;
    assert.equal(indexRows.length, 1);
    assert.match(indexRows[0]!.indexdef, /UNIQUE/);

    console.log(JSON.stringify({ marker, concurrentCreate: concurrentCreate.map((x) => x.status), concurrentDecision: concurrentDecision.map((x) => x.status), finalStatus: finalRequest.status, actionCount: 1, tenantIsolation: "PASS", assignedApprover: "PASS", pendingUniqueIndex: "PASS" }, null, 2));
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    assert.equal(await prisma.tenant.count({ where: { companyName: { startsWith: marker } } }), 0);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
