import { expect, test, type Page, type Route } from "./fixtures/test";

const admin = {
  id: "admin-inbox-1",
  email: "inbox@example.test",
  name: "Inbox Admin",
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  roles: ["SUPER_ADMIN"],
  permissions: [
    "dashboard.read",
    "inbox.read",
    "inbox.manage",
    "security.read",
  ],
};
const item = {
  id: "SECURITY:finding-1",
  sourceId: "finding-1",
  category: "SECURITY",
  priority: "CRITICAL",
  title: "TEST_E2E_ADMIN_INBOX Türkçe güvenlik",
  description: "Kontrollü güvenlik bulgusu",
  href: "/admin/security",
  ownerId: null,
  dueAt: "2026-10-08T00:00:00.000Z",
  overdue: true,
  readAt: null,
  resolvedAt: null,
  createdAt: "2026-10-07T00:00:00.000Z",
};
const response = {
  items: [item],
  unreadCount: 1,
  overdueCount: 1,
  preferences: {
    approvals: true,
    security: true,
    incidents: true,
    expirations: true,
  },
};
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

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

test("filters, preferences and every item action use the expected API contract", async ({
  page,
}) => {
  const queries: string[] = [];
  const actions: Array<Record<string, unknown>> = [];
  let preferences: Record<string, unknown> | null = null;
  await login(page);
  await page.route("**/api/admin/inbox?**", (route) => {
    queries.push(route.request().url());
    return json(route, { data: response });
  });
  await page.route("**/api/admin/inbox/actions", (route) => {
    actions.push(route.request().postDataJSON());
    return json(route, { data: { updated: true } });
  });
  await page.route("**/api/admin/inbox/preferences", (route) => {
    preferences = route.request().postDataJSON();
    return json(route, { data: { updated: true } });
  });

  await page.goto("/admin/inbox");
  await expect(
    page.getByRole("heading", { name: /Bildirim ve/ }),
  ).toBeVisible();
  await expect(page.getByText(item.title)).toBeVisible();
  await expect(page.getByText("1 Okunmamış")).toBeVisible();
  await expect(page.getByText("SLA eşiği aşıldı")).toBeVisible();
  await page.getByRole("button", { name: "Bana atanmış" }).click();
  await expect
    .poll(() => queries.some((url) => url.includes("scope=MINE")))
    .toBe(true);
  await page.getByRole("button", { name: "Atanmamış" }).click();
  await expect
    .poll(() => queries.some((url) => url.includes("scope=UNASSIGNED")))
    .toBe(true);
  await page.getByLabel("Çözülenleri göster").check();
  await expect
    .poll(() => queries.some((url) => url.includes("includeResolved=true")))
    .toBe(true);

  await page.getByText("Bildirim tercihleri").click();
  await page.getByLabel("Güvenlik").uncheck();
  await page.getByRole("button", { name: "Tercihleri kaydet" }).click();
  await expect
    .poll(() => preferences)
    .toMatchObject({ security: false, approvals: true });
  await page.getByRole("button", { name: /Üzerime al/ }).click();
  await page.getByRole("button", { name: "Okundu" }).click();
  await page.getByRole("button", { name: "Çözüldü" }).click();
  await expect
    .poll(() => actions.map((entry) => entry.action))
    .toEqual(expect.arrayContaining(["ASSIGN", "READ", "RESOLVE"]));
  expect(actions.find((entry) => entry.action === "ASSIGN")).toMatchObject({
    category: "SECURITY",
    sourceId: "finding-1",
    ownerId: admin.id,
  });
});

test("opening the source marks unread item read and navigates", async ({
  page,
}) => {
  const actions: Array<Record<string, unknown>> = [];
  await login(page);
  await page.route("**/api/admin/inbox?**", (route) =>
    json(route, { data: response }),
  );
  await page.route("**/api/admin/inbox/actions", (route) => {
    actions.push(route.request().postDataJSON());
    return json(route, { data: { updated: true } });
  });
  await page.goto("/admin/inbox");
  await page.getByRole("button", { name: "Kaynağı aç" }).click();
  await expect(page).toHaveURL(/\/admin\/security$/);
  expect(actions).toContainEqual(
    expect.objectContaining({ action: "READ", sourceId: "finding-1" }),
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/inbox$/);
  await page.reload();
  await expect(page.getByText(item.title)).toBeVisible();
});

test("read-only permission hides management actions but retains personal read action", async ({
  page,
}) => {
  const reader = {
    ...admin,
    id: "reader-1",
    email: "reader@example.test",
    roles: ["READ_ONLY_AUDITOR"],
    permissions: ["dashboard.read", "inbox.read", "security.read"],
  };
  await login(page, reader);
  await page.route("**/api/admin/inbox?**", (route) =>
    json(route, { data: response }),
  );
  await page.goto("/admin/inbox");
  await expect(page.getByRole("button", { name: "Okundu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Üzerime al/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Çözüldü" })).toHaveCount(0);
});

test("empty and error states are visible and retry recovers", async ({
  page,
}) => {
  let failing = true;
  await login(page);
  await page.route("**/api/admin/inbox?**", (route) =>
    failing
      ? json(
          route,
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "controlled inbox error",
            },
          },
          500,
        )
      : json(route, {
          data: { ...response, items: [], unreadCount: 0, overdueCount: 0 },
        }),
  );
  await page.goto("/admin/inbox");
  await expect(page.getByText("controlled inbox error")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect(page.getByText(/Seçili filtrelerde/)).toBeVisible();
});
