import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("warehouses list, search, status, detail, edit and location flow", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_WAREHOUSE_UI_${Date.now()}`;
  let warehouseId = "";
  const failures: string[] = [],
    consoleErrors: string[] = [];
  page.on("requestfailed", (request) =>
    failures.push(`${request.method()} ${request.url()}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 500)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  try {
    await page.goto("/login");
    await page.getByLabel("E-posta adresi").fill("admin@axondemo.com");
    await page
      .getByRole("textbox", { name: /ifre/, exact: true })
      .fill("demo1234");
    await page.getByRole("button", { name: /Giri.*Yap/ }).click();
    await expect(page).toHaveURL(/dashboard/);
    const setup = await page.evaluate(async (marker) => {
      const response = await fetch("http://localhost:3001/api/warehouses", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: `${marker}_W`,
          name: `${marker}_Depo`,
          address: "İstanbul",
        }),
      });
      return { status: response.status, body: await response.json() };
    }, marker);
    expect(setup.status).toBe(201);
    warehouseId = setup.body.data.id;
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: "axon-demo" },
    });
    await prisma.warehouse.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        tenantId: tenant.id,
        code: `${marker}_BULK_${String(index).padStart(3, "0")}`,
        name: `${marker}_Toplu ${String(index).padStart(3, "0")}`,
      })),
    });

    await page.goto("/dashboard/warehouses");
    await expect(page.getByRole("heading", { name: "Depolar" })).toBeVisible();
    const onboarding = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await onboarding
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => onboarding.click())
      .catch(() => undefined);
    await page.getByLabel("Depo ara").fill(marker);
    await expect(
      page.getByText(`${marker}_Depo`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${marker}_Toplu 104`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pasif", exact: true }).click();
    await expect(
      page.getByText(/Aramanızla eşleşen depo bulunamadı/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aktif", exact: true }).click();
    await page.getByText(`${marker}_Depo`, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/warehouses/${warehouseId}$`));
    await expect(page.getByText(`${marker}_W`, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByRole("textbox", { name: "Ad*" })
      .fill(`${marker}_Güncel`);
    await editDialog
      .getByRole("textbox", { name: "Adres", exact: true })
      .fill("Ankara Çankaya");
    await editDialog
      .getByRole("button", { name: "Kaydet", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: `${marker}_Güncel` }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Ankara Çankaya", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await prisma.warehouse.findUnique({ where: { id: warehouseId } }))
            ?.name,
      )
      .toBe(`${marker}_Güncel`);

    await page
      .getByRole("button", { name: "Lokasyon Ekle", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kod").fill(`${marker}_L`);
    await dialog.getByLabel("Ad").fill("Raf Ş-01");
    await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByText(`${marker}_L`, { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        prisma.location.count({ where: { warehouseId, code: `${marker}_L` } }),
      )
      .toBe(1);
    await page
      .locator("main")
      .getByRole("link", { name: "Depolar", exact: true })
      .click();
    await expect(page).toHaveURL(/dashboard\/warehouses$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/warehouses/${warehouseId}$`));
    expect(
      failures.filter((value) => value.includes("/api/warehouses")),
    ).toEqual([]);
    expect(
      consoleErrors.filter(
        (value) =>
          !value.includes("/api/currency-rates/tcmb") &&
          !value.includes("502 (Bad Gateway)"),
      ),
    ).toEqual([]);
  } finally {
    if (warehouseId)
      await prisma.location.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.deleteMany({
      where: { code: { startsWith: marker } },
    });
    await prisma.$disconnect();
  }
});
