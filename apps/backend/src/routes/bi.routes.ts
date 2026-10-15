import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { hashBiToken } from "../services/bi-connector.service.js";

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 5000;

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_PAGE_SIZE ? value : null;
}

function parseCursor(raw: string | undefined): { updatedAt: Date; id: string } | null | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    const updatedAt = typeof value.updatedAt === "string" ? new Date(value.updatedAt) : new Date(Number.NaN);
    if (Number.isNaN(updatedAt.getTime()) || typeof value.id !== "string" || !value.id) return null;
    return { updatedAt, id: value.id };
  } catch {
    return null;
  }
}

function pageResponse<T extends { id: string; updatedAt: Date }>(rows: T[], limit: number, totalEligible: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    count: data.length,
    totalEligible,
    hasMore,
    truncated: hasMore,
    nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt.toISOString(), id: last.id })).toString("base64url")
      : null,
    data,
  };
}

const biRoutes = new Hono<{ Variables: { tenantId: string } }>();

// Multi-tenant BI Token validation middleware
biRoutes.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : queryToken?.trim();

  if (!token) {
    return c.json(
      {
        error: "Unauthorized",
        message:
          "BI Connector token bulunamadı. Lütfen Authorization header veya token parametresi gönderin.",
      },
      401,
    );
  }

  const setting = await prisma.tenantSetting.findFirst({
    // The legacy comparison keeps already-issued tokens usable until their next rotation.
    where: { key: "security.bi.token", value: { in: [hashBiToken(token), token] } },
    select: { tenantId: true },
  });

  if (!setting) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Geçersiz veya süresi dolmuş BI Connector tokenı.",
      },
      401,
    );
  }
  if (setting && !token.startsWith('sha256:')) {
    await prisma.tenantSetting.updateMany({
      where: { tenantId: setting.tenantId, key: "security.bi.token", value: token },
      data: { value: hashBiToken(token) },
    });
  }

  // Verify Enterprise Plan
  const tenant = await prisma.tenant.findUnique({
    where: { id: setting.tenantId },
    select: { plan: true },
  });

  if (tenant?.plan !== "ENTERPRISE") {
    return c.json(
      {
        error: "Forbidden",
        message:
          "BI veri ambarı bağlayıcısı özelliği sadece Enterprise plan müşterileri içindir.",
      },
      403,
    );
  }

  c.set("tenantId", setting.tenantId);
  await next();
});

// GET /export/:entity
biRoutes.get("/export/:entity", async (c) => {
  const tenantId = c.get("tenantId");
  const entity = c.req.param("entity");
  const sinceParam = c.req.query("since");
  const limit = parseLimit(c.req.query("limit"));
  const cursor = parseCursor(c.req.query("cursor"));

  if (limit === null) {
    return c.json({ error: "Bad Request", message: `limit 1-${MAX_PAGE_SIZE} arasinda bir tam sayi olmalidir.` }, 400);
  }
  if (cursor === null) {
    return c.json({ error: "Bad Request", message: "Gecersiz cursor." }, 400);
  }

  let sinceDate: Date | undefined;
  if (sinceParam) {
    const parsed = Date.parse(sinceParam);
    if (Number.isNaN(parsed)) return c.json({ error: "Bad Request", message: "Gecersiz since tarihi." }, 400);
    sinceDate = new Date(parsed);
  }

  const dateFilter = sinceDate ? { updatedAt: { gte: sinceDate } } : {};
  const cursorFilter = cursor ? {
    OR: [
      { updatedAt: { gt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
    ],
  } : {};

  if (entity === "products") {
    const data = await prisma.product.findMany({
      where: { tenantId, deletedAt: null, ...dateFilter, ...cursorFilter },
      select: {
        id: true,
        code: true,
        name: true,
        barcode: true,
        salesPrice: true,
        purchasePrice: true,
        minStockLevel: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const totalEligible = await prisma.product.count({ where: { tenantId, deletedAt: null, ...dateFilter } });
    return c.json(pageResponse(data, limit, totalEligible));
  }

  if (entity === "contacts") {
    const data = await prisma.contact.findMany({
      where: { tenantId, deletedAt: null, ...dateFilter, ...cursorFilter },
      select: {
        id: true,
        type: true,
        code: true,
        name: true,
        taxNumber: true,
        taxOffice: true,
        email: true,
        phone: true,
        city: true,
        country: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const totalEligible = await prisma.contact.count({ where: { tenantId, deletedAt: null, ...dateFilter } });
    return c.json(pageResponse(data, limit, totalEligible));
  }

  if (entity === "invoices") {
    const data = await prisma.invoice.findMany({
      where: { tenantId, deletedAt: null, ...dateFilter, ...cursorFilter },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        date: true,
        dueDate: true,
        currencyCode: true,
        totalGross: true,
        totalNet: true,
        totalTax: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const totalEligible = await prisma.invoice.count({ where: { tenantId, deletedAt: null, ...dateFilter } });
    return c.json(pageResponse(data, limit, totalEligible));
  }

  if (entity === "ledger") {
    const data = await prisma.journalEntry.findMany({
      where: { tenantId, ...dateFilter, ...cursorFilter },
      include: {
        lines: {
          select: {
            id: true,
            debit: true,
            credit: true,
            description: true,
            account: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });
    const totalEligible = await prisma.journalEntry.count({ where: { tenantId, ...dateFilter } });
    return c.json(pageResponse(data, limit, totalEligible));
  }

  return c.json(
    {
      error: "Bad Request",
      message: `Bilinmeyen veya desteklenmeyen veri ambarı varlığı: ${entity}. Desteklenenler: products, contacts, invoices, ledger.`,
    },
    400,
  );
});

export { biRoutes };
