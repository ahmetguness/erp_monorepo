import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("procurement autonomy loads datasets and persists its safe draft policy", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 500)
      failedRequests.push(`${response.status()} ${response.url()}`);
  });
  let tenantId = "";
  let previous: { key: string; value: string }[] = [];
  const keys = [
    "procurement.planning.lookback_days",
    "procurement.planning.horizon_days",
    "procurement.planning.target_service_level",
    "procurement.planning.auto_create_drafts",
    "procurement.planning.maximum_draft_value",
  ];
  try {
    await page.goto("/login");
    await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
    await page
      .getByRole("textbox", { name: /ifre/, exact: true })
      .fill("demo1234");
    await page.getByRole("button", { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    const close = page.getByRole("button", { name: /Onboarding.*kapat/ });
    if (await close.isVisible()) await close.click();
    tenantId = (
      await prisma.tenant.findUniqueOrThrow({ where: { slug: "axon-demo" } })
    ).id;
    previous = await prisma.tenantSetting.findMany({
      where: { tenantId, key: { in: keys } },
      select: { key: true, value: true },
    });
    await page.goto("/dashboard/procurement/autonomy");
    await expect(
      page.getByText("Autonomous Procurement & Supply Chain Studio"),
    ).toBeVisible();
    await expect(page.getByText(/kmal karar merkezi/)).toBeVisible();
    await expect(page.getByText(/Stok Projeksiyonu/)).toBeVisible();
    await expect(page.getByText(/Supplier Reliability Index/)).toBeVisible();
    const policy = page.getByRole("button", { name: /Otomatik taslak/ });
    const initialLabel = await policy.textContent();
    await policy.click();
    await expect(page.getByText(/politikas.*g.*ncellendi/)).toBeVisible();
    await expect(policy).not.toHaveText(initialLabel ?? "");
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Otomatik taslak/ }),
    ).not.toHaveText(initialLabel ?? "");
    await page.goBack();
    await page.goForward();
    await expect(
      page.getByText("Autonomous Procurement & Supply Chain Studio"),
    ).toBeVisible();
    expect(
      failedRequests.filter((value) =>
        value.includes("/api/procurement-autonomy"),
      ),
    ).toEqual([]);
    expect(
      consoleErrors.filter(
        (value) => !value.includes("/api/currency-rates/tcmb"),
      ),
    ).toEqual([]);
  } finally {
    if (tenantId) {
      await prisma.tenantSetting.deleteMany({
        where: { tenantId, key: { in: keys } },
      });
      if (previous.length)
        await prisma.tenantSetting.createMany({
          data: previous.map((row) => ({ tenantId, ...row })),
        });
    }
    await prisma.$disconnect();
  }
});
