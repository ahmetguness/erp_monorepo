import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("e-document UI creates, submits, refreshes and links to its invoice", async ({
  page,
}) => {
  const prisma = new PrismaClient();
  const marker = `TEST_E2E_EDOC_UI_${Date.now()}`;
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let contactId: string | null = null;
  page.on("console", (message) => {
    if (message.type() === "error")
      consoleErrors.push(`${message.text()} ${message.location().url}`);
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
    await page.getByLabel("Şifre", { exact: true }).fill("demo1234");
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/dashboard/);
    const close = page.getByRole("button", { name: "Onboarding'i kapat" });
    if (await close.isVisible()) await close.click();
    const setup = await page.evaluate(async (markerValue) => {
      const contact = await fetch("http://localhost:3001/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOMER",
          name: `${markerValue}_CONTACT`,
          code: `${markerValue}_C`,
          taxNumber: "1234567890",
        }),
      });
      const c = await contact.json();
      const invoice = await fetch("http://localhost:3001/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: c.data.id,
          type: "SALES",
          number: `${markerValue}_INV`,
          date: new Date().toISOString(),
          lines: [
            { description: "TEST UI E-BELGE", quantity: 1, unitPrice: 125 },
          ],
        }),
      });
      return { contactId: c.data.id, invoice: (await invoice.json()).data };
    }, marker);
    contactId = setup.contactId;
    await page.goto(`/dashboard/e-documents?invoiceId=${setup.invoice.id}`);
    await expect(
      page.getByRole("heading", { name: "E-Belgeler" }),
    ).toBeVisible();
    if (await close.isVisible()) await close.click();
    await expect(page.getByRole("dialog")).toContainText("Yeni e-belge");
    await page.getByRole("button", { name: "Oluştur", exact: true }).click();
    await expect(
      page.getByText(`Fatura ${marker}_INV`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "İptal", exact: true })
      .click();
    await expect(
      page.getByText(`Fatura ${marker}_INV`, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await prisma.eDocument.findFirst({
              where: { invoiceId: setup.invoice.id },
            })
          )?.status,
      )
      .toBe("ACCEPTED");
    await page.getByText(`Fatura ${marker}_INV`, { exact: true }).click();
    await expect(page.locator("body")).toContainText("Kabul edildi");
    expect(
      failedRequests.filter((item) => item.includes("/api/e-documents")),
    ).toEqual([]);
    expect(
      consoleErrors.filter(
        (item) => !item.includes("/api/currency-rates/tcmb"),
      ),
    ).toEqual([]);
    await page.getByRole("link", { name: /Kaynağı aç/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/invoices/${setup.invoice.id}`),
    );
  } finally {
    if (contactId) {
      const ids = (
        await prisma.invoice.findMany({
          where: { contactId },
          select: { id: true },
        })
      ).map((row) => row.id);
      await prisma.eDocument.deleteMany({ where: { invoiceId: { in: ids } } });
      await prisma.invoiceLine.deleteMany({
        where: { invoiceId: { in: ids } },
      });
      await prisma.invoiceHistory.deleteMany({
        where: { invoiceId: { in: ids } },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
    }
    await prisma.$disconnect();
  }
});
