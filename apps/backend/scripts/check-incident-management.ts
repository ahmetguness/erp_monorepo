import "dotenv/config";
import assert from "node:assert/strict";
import type { Incident } from "@repo/types";
import { prisma } from "../src/lib/prisma.js";
import {
  addTimelineEntry,
  createIncident,
  decideCommunication,
  getPublicStatusIncidents,
  requestCommunication,
  updateIncident,
} from "../src/modules/platform/incident-management/incident-management.service.js";

const suffix = Date.now().toString(36);
let incidentId = "";
let alertId = "";
let tenantId = "";
let requesterId = "";
let approverId = "";

async function main(): Promise<void> {
  const role = await prisma.adminRole.findFirstOrThrow();
  const [requester, approver, tenant] = await Promise.all([
    prisma.adminUser.create({
      data: {
        email: `incident-requester-${suffix}@test.local`,
        name: "Incident Requester",
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: role.id } },
      },
    }),
    prisma.adminUser.create({
      data: {
        email: `incident-approver-${suffix}@test.local`,
        name: "Incident Approver",
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: role.id } },
      },
    }),
    prisma.tenant.create({
      data: {
        slug: `incident-${suffix}`,
        companyName: "Incident Tenant",
        email: `incident-${suffix}@test.local`,
        plan: "STARTER",
        status: "ACTIVE",
      },
    }),
  ]);
  requesterId = requester.id;
  approverId = approver.id;
  tenantId = tenant.id;
  const alert = await prisma.observabilityAlertHistory.create({
    data: {
      fingerprint: `incident:${suffix}`,
      metricKey: "checkout_error_rate",
      scope: "SERVICE",
      scopeId: "backend",
      severity: "critical",
      status: "OPEN",
      value: 12,
      threshold: 5,
      owner: "platform-operations",
      runbookUrl: "https://runbooks.local/checkout",
      notificationChannel: "ops-alerts",
    },
  });
  alertId = alert.id;
  const createInput = {
    alertId: alert.id,
    title: "Checkout erişim sorunu",
    summary: "Tenant işlemlerinde yüksek hata oranı gözleniyor.",
    severity: "SEV1" as const,
    owner: "platform-operations",
    runbookUrl: "https://runbooks.local/checkout",
    affectedTenantIds: [tenant.id],
  };
  let incident = await createIncident(createInput, requester.id);
  incidentId = incident.id;
  assert.equal(incident.alertId, alert.id);
  await assert.rejects(
    () => createIncident(createInput, requester.id),
    /zaten açık bir olay/,
  );
  assert.equal(incident.affectedTenants[0]?.tenantName, tenant.companyName);
  incident = await addTimelineEntry(
    incident.id,
    "Sorun ödeme sağlayıcısında izole edildi.",
    requester.id,
  );
  assert.equal(incident.timeline.at(-1)?.type, "UPDATE");
  incident = await requestCommunication(
    incident.id,
    "Ödeme işlemlerinde gecikme araştırılıyor; verileriniz güvende.",
    requester.id,
  );
  const communication = incident.communications[0];
  assert.ok(communication);
  assert.equal(communication.recipientCount, 1);
  await assert.rejects(
    () =>
      decideCommunication(
        communication.id,
        "APPROVE",
        "Kendi onayım",
        requester.id,
      ),
    /kendi iletişimini onaylayamaz/,
  );
  const decisions = await Promise.allSettled([
    decideCommunication(
      communication.id,
      "APPROVE",
      "İçerik ve alıcılar doğrulandı.",
      approver.id,
    ),
    decideCommunication(
      communication.id,
      "APPROVE",
      "Yinelenen eşzamanlı onay.",
      approver.id,
    ),
  ]);
  assert.equal(
    decisions.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    decisions.filter((result) => result.status === "rejected").length,
    1,
  );
  const approved = decisions.find(
    (result): result is PromiseFulfilledResult<Incident> =>
      result.status === "fulfilled",
  );
  assert.ok(approved);
  incident = approved.value;
  assert.equal(incident.communications[0]?.status, "PUBLISHED");
  assert.equal(
    (await getPublicStatusIncidents()).some((item) => item.id === incident.id),
    true,
  );
  incident = await updateIncident(
    incident.id,
    {
      status: "RESOLVED",
      rootCause: "Sağlayıcı bağlantı havuzu tükendi.",
      resolution: "Havuz sınırı artırıldı ve devre kesici eklendi.",
    },
    requester.id,
  );
  assert.equal(incident.status, "RESOLVED");
  assert.ok(incident.resolvedAt && incident.rootCause && incident.resolution);
  console.log(
    "Incident management integration: OK (tenant scope, timeline, postmortem, atomic two-person communication approval, public status)",
  );
}

main()
  .finally(async () => {
    if (incidentId)
      await prisma.platformIncident.deleteMany({ where: { id: incidentId } });
    if (alertId)
      await prisma.observabilityAlertHistory.deleteMany({
        where: { id: alertId },
      });
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.adminUser.deleteMany({
      where: { id: { in: [requesterId, approverId].filter(Boolean) } },
    });
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
