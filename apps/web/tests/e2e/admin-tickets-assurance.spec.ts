import { expect, test, type Page, type Route } from "@playwright/test";

const admin = {
  id: "admin-ticket-1",
  email: "ticket-admin@example.test",
  name: "Ticket Admin",
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  roles: ["SUPER_ADMIN"],
  permissions: [
    "dashboard.read",
    "support-ticket.read",
    "support-ticket.manage",
    "support-session.manage",
    "tenant.read",
  ],
};
const ticket = {
  id: "ticket-1",
  ticketNumber: "TCK-2026-123456-1234",
  tenantId: "tenant-1",
  tenantName: "TEST_E2E_TICKET Tenant",
  tenantSlug: "test-e2e-ticket",
  createdById: "user-1",
  createdByUser: {
    id: "user-1",
    name: "Test User",
    email: "user@example.test",
  },
  title: "TEST_E2E_TICKET Türkçe kritik hata",
  description: "Deterministik destek açıklaması.",
  category: "TECHNICAL",
  priority: "HIGH",
  status: "OPEN",
  assignedAdminId: null,
  assignedAdmin: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
  messageCount: 1,
  lastMessageAt: "2026-10-09T00:00:00.000Z",
  messages: [
    {
      id: "message-1",
      ticketId: "ticket-1",
      senderType: "TENANT_USER",
      authorUserId: "user-1",
      authorAdminId: null,
      authorUser: {
        id: "user-1",
        name: "Test User",
        email: "user@example.test",
      },
      authorAdmin: null,
      message: "Deterministik destek açıklaması.",
      isInternal: false,
      createdAt: "2026-10-09T00:00:00.000Z",
    },
  ],
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

test("admin ticket list filters, clear, refresh and navigation work", async ({
  page,
}) => {
  const queries: string[] = [];
  await login(page);
  await page.route("**/api/admin/support-tickets**", (route) => {
    queries.push(route.request().url());
    return json(route, { data: [ticket] });
  });
  await page.goto("/admin/tickets");
  await expect(page.getByText(ticket.title)).toBeVisible();
  await page.getByRole("button", { name: "Açık" }).click();
  await page.getByRole("combobox").nth(0).selectOption("HIGH");
  await page.getByRole("combobox").nth(1).selectOption("TECHNICAL");
  await page.getByPlaceholder(/Bilet, işletme/).fill("TEST_E2E");
  await expect
    .poll(() =>
      queries.some(
        (url) =>
          url.includes("status=OPEN") &&
          url.includes("priority=HIGH") &&
          url.includes("category=TECHNICAL") &&
          url.includes("search=TEST_E2E"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Temizle" }).click();
  await expect(page.getByPlaceholder(/Bilet, işletme/)).toHaveValue("");
  await page.getByRole("button", { name: "Yenile" }).click();
  await page.getByRole("link", { name: ticket.ticketNumber }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\/ticket-1$/);
});

test("detail supports assignment, lifecycle, priority, public reply and internal note", async ({
  page,
}) => {
  const updates: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  await login(page);
  await page.route("**/api/admin/support-tickets/ticket-1", (route) => {
    if (route.request().method() === "PATCH") {
      updates.push(route.request().postDataJSON());
      return json(route, { data: ticket });
    }
    return json(route, { data: ticket });
  });
  await page.route(
    "**/api/admin/support-tickets/ticket-1/messages",
    (route) => {
      messages.push(route.request().postDataJSON());
      return json(
        route,
        {
          data: {
            ...ticket.messages[0],
            id: `message-${messages.length + 1}`,
            senderType: "ADMIN_USER",
            authorUserId: null,
            authorAdminId: admin.id,
            isInternal: Boolean(messages.at(-1)?.isInternal),
          },
        },
        201,
      );
    },
  );
  await page.goto("/admin/tickets/ticket-1");
  await expect(page.getByText(ticket.title)).toBeVisible();
  await page.getByRole("button", { name: "Kendime Ata" }).click();
  await page.getByRole("button", { name: "Çözüldü Yap" }).click();
  await page.getByRole("combobox").nth(1).selectOption("URGENT");
  await expect
    .poll(() => updates)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assignedAdminId: admin.id }),
        expect.objectContaining({ status: "RESOLVED" }),
        expect.objectContaining({ priority: "URGENT" }),
      ]),
    );
  const reply = page.getByPlaceholder(/Müşteriye gönderilecek/);
  await reply.fill("TEST_E2E müşteriye kontrollü yanıt");
  await page.getByRole("button", { name: "Yanıtı Gönder" }).click();
  await page.getByRole("button", { name: /Dahili Not Ekle/ }).click();
  await page
    .getByPlaceholder(/Yalnızca yöneticilerin/)
    .fill("TEST_E2E gizli dahili not");
  await page.getByRole("button", { name: "Dahili Notu Kaydet" }).click();
  await expect
    .poll(() => messages)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isInternal: false }),
        expect.objectContaining({ isInternal: true }),
      ]),
    );
  await expect(
    page.getByRole("link", { name: /Destek Oturumu Başlat/ }),
  ).toBeVisible();
});

test("read-only admin sees ticket but no management or support-session controls", async ({
  page,
}) => {
  const reader = {
    ...admin,
    id: "ticket-reader",
    email: "ticket-reader@example.test",
    roles: [],
    permissions: ["dashboard.read", "support-ticket.read"],
  };
  await login(page, reader);
  await page.route("**/api/admin/support-tickets/ticket-1", (route) =>
    json(route, { data: ticket }),
  );
  await page.goto("/admin/tickets/ticket-1");
  await expect(page.getByText(ticket.title)).toBeVisible();
  await expect(page.getByRole("button", { name: "Kendime Ata" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Çözüldü Yap" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Yanıtı Gönder" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: /Destek Oturumu Başlat/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox").nth(0)).toBeDisabled();
  await expect(page.getByRole("combobox").nth(1)).toBeDisabled();
});

test("list API error is visible and retry recovers to empty state", async ({
  page,
}) => {
  let failing = true;
  await login(page);
  await page.route("**/api/admin/support-tickets**", (route) =>
    failing
      ? json(
          route,
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "controlled admin tickets error",
            },
          },
          500,
        )
      : json(route, { data: [] }),
  );
  await page.goto("/admin/tickets");
  await expect(page.getByText("controlled admin tickets error")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: /Tekrar dene/ }).click();
  await expect(
    page.getByText(/Kriterlere uygun bilet bulunamadı/),
  ).toBeVisible();
});
