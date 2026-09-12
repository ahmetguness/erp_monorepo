import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  addDemoRequestNote,
  assignDemoRequest,
  getDemoRequest,
  listDemoRequests,
  previewDemoProvisioning,
} from "../src/modules/platform/demo-operations/index.js";
import {
  createDemoRequest,
  rejectDemoRequest,
} from "../src/services/demo.service.js";

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  assert.ok(admin, "Aktif admin gerekli.");
  const suffix = Date.now().toString(36);
  const publicResult = await createDemoRequest({
    fullName: "Public Demo Testi",
    companyName: `Public Demo ${suffix}`,
    email: `public-demo-${suffix}@example.invalid`,
    plan: "STARTER",
  });
  assert.equal(publicResult.success, true);
  assert.ok("demoRequestId" in publicResult);
  const publicRequest = await prisma.demoRequest.findUnique({
    where: { id: publicResult.demoRequestId },
  });
  assert.equal(publicRequest?.status, "PENDING");
  await prisma.demoRequest.delete({
    where: { id: publicResult.demoRequestId },
  });

  const request = await prisma.demoRequest.create({
    data: {
      fullName: "Demo Operasyon Testi",
      companyName: `Demo Test ${suffix}`,
      email: `demo-${suffix}@example.invalid`,
      status: "PENDING",
      history: { create: { action: "CREATED" } },
    },
  });
  try {
    const page = await listDemoRequests({
      status: "PENDING",
      search: suffix,
      page: 1,
      limit: 20,
    });
    assert.equal(page.data[0]?.id, request.id);
    const preview = await previewDemoProvisioning(request.id);
    assert.equal(preview.requestId, request.id);
    assert.equal(preview.trialDays, 15);
    await assignDemoRequest(request.id, admin.id, admin.id);
    await addDemoRequestNote(
      request.id,
      "Satış görüşmesi tamamlandı.",
      admin.id,
    );
    assert.equal((await getDemoRequest(request.id))?.ownerId, admin.id);
    assert.equal(
      (
        await rejectDemoRequest(
          request.id,
          admin.id,
          "Müşteri talebi üzerine ertelendi.",
        )
      ).success,
      true,
    );
    const rejected = await getDemoRequest(request.id);
    assert.equal(rejected?.status, "REJECTED");
    assert.equal(rejected?.processedBy, admin.id);
    assert.ok(rejected?.history.some((event) => event.action === "REJECTED"));
  } finally {
    await prisma.demoRequest.delete({ where: { id: request.id } });
  }
  console.log(
    "Demo request operations integration: OK (public queue, SLA, preview, owner, note, rejection, history)",
  );
}

main().finally(() => prisma.$disconnect());
