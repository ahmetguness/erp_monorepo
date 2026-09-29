import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("purchase requests UI edits, submits, approves, audits and survives navigation", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_PUR_REQ_UI_${Date.now()}`;
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let productId = "";
  let requestId = "";
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
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: "axon-demo" },
    });
    const unit = await prisma.unit.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        code: `${marker}_P`,
        name: `${marker}_ÜRÜN`,
        purchasePrice: 17.5,
      },
    });
    productId = product.id;
    const setup = await page.evaluate(
      async ({ id, name }) => {
        const response = await fetch(
          "http://localhost:3001/api/purchase-orders/requests",
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              date: new Date().toISOString(),
              notes: name,
              items: [{ productId: id, quantity: 2, unitPrice: 17.5 }],
            }),
          },
        );
        return { status: response.status, body: await response.json() };
      },
      { id: product.id, name: marker },
    );
    expect(setup.status).toBe(201);
    requestId = setup.body.data.id;
    const number = setup.body.data.number;
    await page.goto("/dashboard/purchase-orders/requests");
    await expect(
      page.getByRole("heading", { name: /Sat.*n Alma Talepleri/ }),
    ).toBeVisible();
    const lateOnboardingClose = page.getByRole("button", { name: /Onboarding.*kapat/ });
    await lateOnboardingClose.waitFor({ state: "visible", timeout: 2000 }).then(() => lateOnboardingClose.click()).catch(() => undefined);
    await expect(page.getByPlaceholder(/Talep no/)).toBeVisible();
    await page.getByPlaceholder(/Talep no/).fill(marker);
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Taslak/, exact: true }).click();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.getByText(number, { exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(marker);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Düzenle/, exact: true })
      .click();
    await page.getByRole("dialog").getByLabel(/Notlar/).fill(`${marker}_UPDATED`);
    await page.getByRole("dialog").getByLabel(/Miktar/).fill("3");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Değişiklikleri kaydet/ })
      .click();
    await expect(page.getByText(/Talep güncellendi/)).toBeVisible();
    await expect.poll(async () => Number((await prisma.purchaseRequest.findUnique({ where: { id: requestId } }))?.totalEstimated)).toBe(52.5);
    await page.getByText(number, { exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(`${marker}_UPDATED`);
    await page.getByRole("dialog").getByRole("button", { name: /Onaya gönder/, exact: true }).click({ force: true });
    await page.getByRole("dialog").last().getByRole("button", { name: /Devam et/ }).click();
    await expect(page.getByText(/Talep onaya gönderildi/)).toBeVisible();
    await expect.poll(async () => (await prisma.purchaseRequest.findUnique({ where: { id: requestId } }))?.status).toBe("PENDING_APPROVAL");
    await page.getByRole("button", { name: "Tümü", exact: true }).click({ force: true });
    await page.getByText(number, { exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Geçmiş");
    await page.getByRole("dialog").getByRole("button", { name: /Onayla/, exact: true }).click();
    await page.getByRole("button", { name: /Onayla/, exact: true }).last().click();
    await expect(page.getByText(/Talep onayland/)).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await prisma.purchaseRequest.findUnique({
              where: { id: requestId },
            })
          )?.status,
      )
      .toBe("APPROVED");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tümü", exact: true }).click();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Rahat/ }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Sayfay.*aktar/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("purchase-requests.csv");
    await page.getByRole("button", { name: /Yeni talep/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Talebi olu.*tur/ })
      .click({ force: true });
    await expect(page.getByRole("dialog").getByText("Yeni satın alma talebi")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /ptal/ })
      .click();
    await page.reload();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.goto("/dashboard");
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: /Sat.*n Alma Talepleri/ }),
    ).toBeVisible();
    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/dashboard/);
    expect(
      failedRequests.filter((value) => value.includes("/api/purchase-orders")),
    ).toEqual([]);
    expect(
      consoleErrors.filter(
        (value) =>
          !value.includes("/api/currency-rates/tcmb") &&
          !value.includes("502 (Bad Gateway)"),
      ),
    ).toEqual([]);
  } finally {
    if (requestId) {
      await prisma.auditLog.deleteMany({ where: { module: "purchasing.purchase-request", entityId: requestId } });
      await prisma.purchaseRequest.deleteMany({ where: { id: requestId } });
    }
    if (productId)
      await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
});
