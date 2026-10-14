import { expect, test, type Page, type Route } from "@playwright/test";

const sse = (route: Route, output: string) =>
  route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body: `event: token\ndata: ${JSON.stringify({ token: output })}\n\nevent: done\ndata: ${JSON.stringify({ output, usedTools: false })}\n\n`,
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

test("public chatbot opens, streams, blocks duplicate submit, clears server context and handles errors", async ({
  page,
}) => {
  const sessionIds: string[] = [];
  let fail = false;
  await page.route("**/api/public/chat/stream", async (route) => {
    const body = route.request().postDataJSON() as { sessionId: string };
    sessionIds.push(body.sessionId);
    if (fail)
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "TEST_CHATBOT_E2E_PROVIDER" }),
      });
    return sse(route, "**TEST_CHATBOT_E2E_PUBLIC_OK**");
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Chatbot aç" }).click();
  const input = page.getByPlaceholder("Bir soru sorun...");
  await expect(page.getByRole("button", { name: "Gönder" })).toBeDisabled();
  await input.fill("Merhaba");
  await input.press("Enter");
  await expect(page.getByText("TEST_CHATBOT_E2E_PUBLIC_OK")).toBeVisible();
  await page.getByRole("button", { name: "Sohbeti temizle" }).click();
  await input.fill("Yeni bağlam");
  await page.getByRole("button", { name: "Gönder" }).click();
  expect(sessionIds[1]).not.toBe(sessionIds[0]);

  fail = true;
  await input.fill("Hata testi");
  await input.press("Enter");
  await expect(page.getByText("TEST_CHATBOT_E2E_PROVIDER")).toBeVisible();
  await page.getByRole("button", { name: "Kapat" }).click();
  await expect(page.getByRole("button", { name: "Chatbot aç" })).toBeVisible();
});

test("tenant chatbot uses authenticated stream, clears backend history and survives provider error", async ({
  page,
}) => {
  await login(page);
  let clearCalls = 0;
  let fail = false;
  await page.route("**/api/chat/history", (route) => {
    clearCalls++;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/chat/stream", (route) =>
    fail
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "TEST_CHATBOT_E2E_TENANT_PROVIDER" }),
        })
      : sse(route, "**TEST_CHATBOT_E2E_TENANT_OK**"),
  );

  await page.getByRole("button", { name: "Axon Asistanı aç" }).click();
  const input = page.getByPlaceholder(
    "Cari sorgula, rapor iste, stok kontrol et...",
  );
  await input.fill("Stok durumunu göster");
  await input.press("Enter");
  await expect(page.getByText("TEST_CHATBOT_E2E_TENANT_OK")).toBeVisible();
  await page.getByRole("button", { name: "Sohbeti temizle" }).click();
  await expect.poll(() => clearCalls).toBe(1);

  fail = true;
  await input.fill("Hata testi");
  await input.press("Enter");
  await expect(
    page.getByText(/TEST_CHATBOT_E2E_TENANT_PROVIDER|yanıt veremiyorum/i),
  ).toBeVisible();
});
