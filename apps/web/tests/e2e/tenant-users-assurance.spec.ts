import { expect, test, type Page, type Route } from "@playwright/test";

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
  await page
    .getByRole("textbox", { name: /ifre/, exact: true })
    .fill("demo1234");
  await page.getByRole("button", { name: /Giri.*Yap/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const owner = {
  id: "tu-owner",
  userId: "user-owner",
  roleId: null,
  isOwner: true,
  isActive: true,
  user: {
    id: "user-owner",
    email: "owner@test.invalid",
    name: "TEST_E2E Owner",
    isActive: true,
  },
  roleRef: null,
};
const member = {
  id: "tu-member",
  userId: "user-member",
  roleId: "role-read",
  isOwner: false,
  isActive: true,
  user: {
    id: "user-member",
    email: "member@test.invalid",
    name: "TEST_E2E Member",
    isActive: true,
  },
  roleRef: { id: "role-read", name: "Okuyucu" },
};
const invite = {
  id: "invite-1",
  email: "pending@test.invalid",
  roleId: "role-read",
  status: "PENDING",
  expiresAt: "2026-10-16T12:00:00.000Z",
  invitedBy: "user-owner",
  acceptedAt: null,
  createdAt: "2026-10-14T12:00:00.000Z",
};

test("users UI loads members, validates invite, updates role and cancels invitation", async ({
  page,
}) => {
  await login(page);
  const calls: string[] = [];
  await page.route(/\/api\/users(?:\/[^/?]+)?(?:\?.*)?$/, (route) => {
    calls.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname}`,
    );
    if (route.request().method() === "PATCH")
      return json(route, { data: member.user });
    return json(route, {
      data: [owner, member],
      meta: { total: 2, page: 1, pageSize: 50, totalPages: 1 },
    });
  });
  await page.route(
    /\/api\/invitations(?:\/[^/?]+\/cancel)?(?:\?.*)?$/,
    (route) => {
      calls.push(
        `${route.request().method()} ${new URL(route.request().url()).pathname}`,
      );
      if (route.request().method() === "GET")
        return json(route, { data: [invite] });
      return json(
        route,
        { success: true, invitationId: "invite-new" },
        route.request().url().includes("/cancel") ? 200 : 201,
      );
    },
  );
  await page.route("**/api/roles**", (route) =>
    json(route, {
      data: [
        {
          id: "role-read",
          tenantId: "cmuyhzuqd002mgbhonjvtpqcq",
          name: "Okuyucu",
          description: "Salt okunur",
          isSystem: false,
          createdAt: "2026-10-14T00:00:00.000Z",
          updatedAt: "2026-10-14T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
    }),
  );

  await page.goto("/dashboard/settings/users");
  await expect(
    page.getByRole("heading", { name: /Kullanıcılar.*Davetler/ }),
  ).toBeVisible();
  await expect(page.getByText("TEST_E2E Member")).toBeVisible();
  await expect(page.getByText("pending@test.invalid")).toBeVisible();

  await page.getByRole("button", { name: "Kullanıcı Davet Et" }).click();
  const email = page.getByPlaceholder("kullanici@sirket.com");
  await email.fill("invalid");
  await email.press("Enter");
  expect(calls.filter((call) => call === "POST /api/invitations")).toHaveLength(
    0,
  );
  await email.fill("test_e2e_yeni@test.invalid");
  await email.press("Enter");
  await expect
    .poll(() => calls.filter((call) => call === "POST /api/invitations").length)
    .toBe(1);

  await page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Okuyucu" }) })
    .first()
    .selectOption("");
  await expect
    .poll(() => calls.some((call) => call === "PATCH /api/users/user-member"))
    .toBe(true);
  await page.getByTitle("İptal et").click();
  await expect
    .poll(() =>
      calls.some((call) => call === "POST /api/invitations/invite-1/cancel"),
    )
    .toBe(true);
});

test("users UI exposes API failure and retry recovery", async ({ page }) => {
  await login(page);
  let fail = true;
  await page.route(/\/api\/users(?:\?.*)?$/, (route) =>
    fail
      ? json(route, { error: "TEST_E2E_USERS_ERROR" }, 500)
      : json(route, {
          data: [],
          meta: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
        }),
  );
  await page.route(/\/api\/invitations(?:\?.*)?$/, (route) =>
    fail
      ? json(route, { error: "TEST_E2E_INVITES_ERROR" }, 500)
      : json(route, { data: [] }),
  );
  await page.route("**/api/roles**", (route) =>
    json(route, {
      data: [],
      meta: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    }),
  );
  await page.goto("/dashboard/settings/users");
  const errorAlert = page
    .getByRole("alert")
    .filter({ hasText: "verileri yüklenemedi" });
  await expect(errorAlert).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Tekrar Dene" }).click();
  await expect(errorAlert).toHaveCount(0);
  await expect(page.getByText("Henüz ekip üyesi bulunmuyor.")).toBeVisible();
});
