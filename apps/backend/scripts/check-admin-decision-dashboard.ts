import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  decisionDashboardQuerySchema,
  getAdminDecisionDashboard,
} from "../src/modules/platform/decision-dashboard/index.js";

async function main(): Promise<void> {
  assert.equal(
    decisionDashboardQuerySchema.parse({ rangeDays: "7" }).rangeDays,
    7,
  );
  assert.equal(decisionDashboardQuerySchema.parse({}).rangeDays, 30);
  assert.equal(
    decisionDashboardQuerySchema.safeParse({ rangeDays: "14" }).success,
    false,
  );

  const dashboard = await getAdminDecisionDashboard(30, [
    "tenant.read",
    "operations.read",
    "change-request.read",
  ]);
  assert.equal(dashboard.metrics.length, 8);
  assert.deepEqual(
    new Set(dashboard.metrics.map((item) => item.key)),
    new Set([
      "ACTIVE_USAGE",
      "TRIAL_CONVERSION",
      "CHURN_RISK",
      "MRR",
      "ARR",
      "ERROR_BUDGET",
      "OPEN_INCIDENTS",
      "PENDING_APPROVALS",
    ]),
  );
  assert.ok(dashboard.metrics.every((item) => Number.isFinite(item.value)));
  assert.ok(dashboard.metrics.every((item) => item.href.startsWith("/admin/")));
  assert.ok(
    new Date(dashboard.period.previousFrom) < new Date(dashboard.period.from),
  );
  const openIncidentCount = await prisma.platformIncident.count({
    where: { status: { not: "RESOLVED" } },
  });
  assert.equal(
    dashboard.metrics.find((item) => item.key === "OPEN_INCIDENTS")?.value,
    openIncidentCount,
  );
  const restricted = await getAdminDecisionDashboard(30, ["tenant.read"]);
  assert.equal(
    restricted.metrics.some((item) => item.key === "OPEN_INCIDENTS"),
    false,
  );
  assert.equal(
    restricted.metrics.some((item) => item.key === "ERROR_BUDGET"),
    false,
  );
  assert.equal(
    restricted.metrics.some((item) => item.key === "PENDING_APPROVALS"),
    false,
  );
  console.log(
    "Admin decision dashboard integration: OK (ranges, metrics, comparisons, drill-downs)",
  );
}

main().finally(() => prisma.$disconnect());
