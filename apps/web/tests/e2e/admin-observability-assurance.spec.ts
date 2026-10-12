import { expect, test, type Page, type Route } from "@playwright/test";

const admin = {
  id: "admin-observability",
  email: "observability@example.test",
  name: "Observability Admin",
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  roles: ["SUPER_ADMIN"],
  permissions: ["dashboard.read", "operations.read", "operations.manage"],
};
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
const snapshot = {
  runtime: {
    appRole: "api",
    marketplaceWorkerEnabled: false,
    uptimeSeconds: 3600,
    generatedAt: "2026-10-12T18:00:00.000Z",
  },
  http: {
    totalRequests: 100,
    totalErrors: 2,
    errorRatePct: 2,
    slowThresholdMs: 1000,
    p95Ms: 250,
    p99Ms: 900,
    endpoints: [
      {
        key: "GET:/api/test",
        method: "GET",
        path: "/api/test",
        count: 10,
        errorCount: 1,
        errorRatePct: 10,
        avgMs: 100,
        p95Ms: 200,
        p99Ms: 300,
        maxMs: 400,
      },
    ],
    errorRateTrend: [
      {
        bucketStart: "2026-10-12T17:00:00.000Z",
        requestCount: 10,
        errorCount: 1,
      },
    ],
    recentSlowEndpoints: [],
    recentErrors: [],
  },
  slowQueries: { thresholdMs: 500, recent: [] },
  authorization: {
    resolutionCount: 20,
    deniedCount: 1,
    avgDurationMs: 2,
    maxDurationMs: 5,
    totalQueryCount: 20,
    avgQueryCount: 1,
  },
  externalServices: [],
  domainEvents: {
    pendingCount: 1,
    processingCount: 1,
    failedCount: 0,
    deadLetterCount: 0,
    recentFailures: [],
  },
  workerJobs: {
    retryScheduledCount: 0,
    deadLetterCount: 0,
    byStatus: [{ status: "COMPLETED", count: 3 }],
    recentProblemJobs: [],
  },
  telemetry: {
    persistence: { mode: "persistent", durable: true, detail: "PostgreSQL" },
    sentry: { enabled: false },
    openTelemetry: { enabled: true, exporter: "otlp" },
    prometheus: { enabled: true, path: "/metrics", protected: true },
  },
  alerts: [
    {
      key: "http_error_rate",
      severity: "warning",
      active: true,
      value: 2,
      threshold: 1,
      unit: "percent",
    },
  ],
};
const history = {
  range: "24h",
  points: [],
  pointsMeta: {
    totalEligible: 20050,
    returned: 20000,
    limit: 20000,
    truncated: true,
    hasMore: true,
    coverage: "LATEST",
    ordering: "bucketAt_asc",
  },
  slos: [
    {
      id: "slo-1",
      name: "Backend availability",
      scope: "SERVICE",
      scopeId: "backend",
      metricKey: "availability_pct",
      targetPercentage: 99.9,
      windowDays: 30,
      owner: "platform-operations",
      runbookUrl: "https://runbooks.local/backend",
      notificationChannel: "ops-alerts",
      isEnabled: true,
      sliPercentage: 100,
      errorBudgetRemainingPercentage: 100,
      sampleCount: 1,
    },
  ],
  alerts: [],
  deployments: [],
  logs: [],
};
const openAlert = {
  id: "alert-1",
  metricKey: "http_error_rate",
  scope: "SERVICE",
  scopeId: "backend",
  severity: "warning",
  status: "OPEN",
  value: 2,
  threshold: 1,
  owner: "platform-operations",
  runbookUrl: "https://runbooks.local/error-rate",
  notificationChannel: "ops-alerts",
  silencedUntil: null,
  openedAt: "2026-10-12T18:00:00.000Z",
  resolvedAt: null,
};
const coverage = {
  schemaVersion: 1,
  publishCoverage: [],
  listenerIdempotency: [],
};

async function login(page: Page, identity = admin) {
  await page.route("**/api/admin/**", (route) => json(route, { data: [] }));
  await page.route("**/api/admin/auth/login", (route) =>
    json(route, { data: { status: "AUTHENTICATED", admin: identity } }),
  );
  await page.route("**/api/admin/auth/me", (route) =>
    json(route, { data: identity }),
  );
  await page.route("**/api/admin/ui-preferences", (route) =>
    json(route, {
      data: {
        locale: "tr-TR",
        highContrast: false,
        reduceMotion: false,
        density: "COMFORTABLE",
      },
    }),
  );
  await page.goto("/admin/login");
  await page.getByLabel("E-posta adresi").fill(identity.email);
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("safe-password");
  await page.getByRole("button", { name: /Kimlik Do/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("live metrics, trace search, clear action, refresh and historical navigation work", async ({
  page,
}) => {
  let liveCalls = 0;
  await login(page);
  await page.route("**/api/admin/observability", (route) => {
    liveCalls += 1;
    return json(route, { data: snapshot });
  });
  await page.route("**/api/admin/observability/search?**", (route) =>
    json(route, {
      data: {
        query: "request-123",
        slowEndpoints: [],
        errors: [],
        slowQueries: [],
        persistentLogs: [
          {
            id: "log-1",
            level: "ERROR",
            service: "backend",
            message: "masked",
            requestId: "request-123",
            correlationId: "correlation-123",
            occurredAt: "2026-10-12T18:00:00.000Z",
          },
        ],
        auditLogs: [],
      },
    }),
  );
  await page.route("**/api/admin/observability/history?**", (route) =>
    json(route, { data: history }),
  );
  await page.route("**/api/admin/domain-events/coverage**", (route) =>
    json(route, { data: coverage }),
  );
  await page.route("**/api/admin/incidents**", (route) =>
    json(route, { data: [] }),
  );
  await page.goto("/admin/observability");
  await expect(
    page.getByRole("heading", { name: /Gözlemlenebilirlik/ }),
  ).toBeVisible();
  await expect(page.getByText("250ms")).toBeVisible();
  await expect(page.getByText("/api/test")).toBeVisible();
  const trace = page.getByPlaceholder(/requestId/);
  await trace.fill("short");
  await expect(page.getByRole("button", { name: "İzi Getir" })).toBeDisabled();
  await trace.fill("request-123");
  await page.getByRole("button", { name: "İzi Getir" }).click();
  await expect(page.getByText("Kalıcı Log")).toBeVisible();
  await expect(
    page.getByText("Kalıcı Log").locator("..").getByText("1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yenile" }).click();
  await expect.poll(() => liveCalls).toBeGreaterThan(1);
  await page.getByRole("button", { name: /SLO & Tarihsel/ }).click();
  await expect(page.getByText("Backend availability")).toBeVisible();
  await expect(page.getByText(/20\.050 uygun kaydın son 20\.000 noktası/)).toBeVisible();
  await expect(page.getByRole("button", { name: "SLO kaydet" })).toBeVisible();
});

test("main API error is explicit and retry recovers", async ({ page }) => {
  let failing = true;
  await login(page);
  await page.route("**/api/admin/observability", (route) =>
    json(
      route,
      failing
        ? {
            error: {
              code: "INTERNAL_ERROR",
              message: "controlled observability error",
            },
          }
        : { data: snapshot },
      failing ? 500 : 200,
    ),
  );
  await page.goto("/admin/observability");
  await expect(page.getByText("controlled observability error")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect(page.getByText("/api/test")).toBeVisible();
});

test("historical API error is explicit and retry preserves completeness metadata", async ({ page }) => {
  let failing = true;
  await login(page);
  await page.route("**/api/admin/observability", (route) => json(route, { data: snapshot }));
  await page.route("**/api/admin/observability/history?**", (route) =>
    json(route, failing ? { error: { code: "INTERNAL_ERROR", message: "historical failure" } } : { data: history }, failing ? 500 : 200),
  );
  await page.route("**/api/admin/domain-events/coverage**", (route) => json(route, { data: coverage }));
  await page.route("**/api/admin/incidents**", (route) => json(route, { data: [] }));
  await page.goto("/admin/observability?tab=historical");
  await expect(page.getByText(/geçmişi alınamadı/i)).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(page.getByText(/20\.050 uygun kaydın son 20\.000 noktası/)).toBeVisible();
});

test("read-only admin cannot see observability mutation controls", async ({
  page,
}) => {
  const reader = {
    ...admin,
    id: "admin-reader",
    permissions: ["dashboard.read", "operations.read"],
  };
  await login(page, reader);
  await page.route("**/api/admin/observability", (route) =>
    json(route, { data: snapshot }),
  );
  await page.route("**/api/admin/observability/history?**", (route) =>
    json(route, { data: history }),
  );
  await page.route("**/api/admin/domain-events/coverage**", (route) =>
    json(route, { data: coverage }),
  );
  await page.route("**/api/admin/incidents**", (route) =>
    json(route, { data: [] }),
  );
  await page.goto("/admin/observability?tab=historical");
  await expect(page.getByText("Backend availability")).toBeVisible();
  await expect(page.getByRole("button", { name: "SLO kaydet" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Deploy işareti ekle" }),
  ).toHaveCount(0);
});

test("manager can create SLO/deployment and update/silence an alert with expected payloads", async ({
  page,
}) => {
  const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
  await login(page);
  await page.route("**/api/admin/observability", (route) =>
    json(route, { data: snapshot }),
  );
  await page.route("**/api/admin/observability/history?**", (route) =>
    json(route, { data: { ...history, alerts: [openAlert] } }),
  );
  await page.route("**/api/admin/domain-events/coverage**", (route) =>
    json(route, { data: coverage }),
  );
  await page.route("**/api/admin/incidents**", (route) =>
    json(route, { data: [] }),
  );
  await page.route("**/api/admin/observability/slos", (route) => {
    writes.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    return json(route, { data: history.slos[0] });
  });
  await page.route("**/api/admin/observability/deployments", (route) => {
    writes.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    return json(
      route,
      {
        data: {
          id: "deploy-1",
          service: "backend",
          version: "v-test",
          environment: "production",
          description: null,
          deployedAt: "2026-10-12T18:00:00.000Z",
        },
      },
      201,
    );
  });
  await page.route(
    "**/api/admin/observability/alerts/alert-1/ownership",
    (route) => {
      writes.push({
        url: route.request().url(),
        body: route.request().postDataJSON(),
      });
      return json(route, { data: { ...openAlert, owner: "sre-team" } });
    },
  );
  await page.route(
    "**/api/admin/observability/alerts/alert-1/silence",
    (route) => {
      writes.push({
        url: route.request().url(),
        body: route.request().postDataJSON(),
      });
      return json(route, {
        data: { ...openAlert, silencedUntil: "2026-10-12T19:00:00.000Z" },
      });
    },
  );
  await page.goto("/admin/observability");
  await page.getByRole("button", { name: /SLO & Tarihsel/ }).click();
  await expect(page.getByText("http_error_rate · OPEN")).toBeVisible();
  await page.getByRole("button", { name: "SLO kaydet" }).click();
  await page.getByPlaceholder("Sürüm").fill("v-test");
  await page.getByRole("button", { name: "Deploy işareti ekle" }).click();
  await page.getByRole("button", { name: "Sahipliği düzenle" }).click();
  const editor = page
    .getByRole("button", { name: "Kaydet", exact: true })
    .locator("..");
  await editor.locator("input").nth(0).fill("sre-team");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.getByRole("button", { name: "1 saat sustur" }).click();
  await expect.poll(() => writes.length).toBe(4);
  expect(writes[0]?.body).toMatchObject({
    scope: "SERVICE",
    scopeId: "backend",
    metricKey: "availability_pct",
    targetPercentage: 99.9,
  });
  expect(writes[1]?.body).toMatchObject({
    service: "backend",
    version: "v-test",
    environment: "production",
  });
  expect(writes[2]?.body).toMatchObject({
    owner: "sre-team",
    runbookUrl: "https://runbooks.local/error-rate",
    notificationChannel: "ops-alerts",
  });
  expect(writes[3]?.body.reason).toContain("bir saat");
});
