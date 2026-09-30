import { Prisma, ReservationRefType } from "@prisma/client";
import { Context } from "hono";
import { ValidationError } from "../../../../errors/index.js";
import { prisma } from "../../../../lib/prisma.js";
import { InventoryReservationService } from "../../../../services/inventory-reservation.service.js";
import {
  requireParam,
  requireTenantId,
  requireUserId,
} from "../../../../utils/context.js";
import {
  parseReleaseReservation,
  parseReserveStock,
} from "../../application/operations/index.js";
import { inventoryApplication } from "../../composition.js";

interface ReservationListQuery {
  page?: string;
  limit?: string;
  productId?: string;
  warehouseId?: string;
  refType?: ReservationRefType;
  active?: string;
  status?: "all" | "active" | "expired" | "released";
  search?: string;
}

interface SalesOrderReservationDTO {
  orderId: string;
  warehouseId: string;
  allowPartial?: boolean;
  expiresAt?: string;
}

const reservationService = new InventoryReservationService(prisma);

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value))
    throw new ValidationError(`${field} pozitif bir tam sayi olmalidir.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new ValidationError(`${field} 1-${maximum} araliginda olmalidir.`);
  return parsed;
}

export const InventoryReservationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as ReservationListQuery;
    const page = positiveInteger(query.page, 1, 100_000, "page");
    const pageSize = positiveInteger(query.limit, 20, 100, "limit");
    if (
      query.refType &&
      !Object.values(ReservationRefType).includes(query.refType)
    )
      throw new ValidationError("Gecersiz rezervasyon referans tipi.");
    if (query.active && query.active !== "true" && query.active !== "false")
      throw new ValidationError("active true veya false olmalidir.");
    if (
      query.status &&
      !["all", "active", "expired", "released"].includes(query.status)
    )
      throw new ValidationError("Gecersiz rezervasyon durumu.");
    const search = query.search?.trim();
    if (search && search.length > 100)
      throw new ValidationError("search en fazla 100 karakter olabilir.");
    const now = new Date();
    const statusWhere: Prisma.InventoryReservationWhereInput =
      query.status === "active"
        ? {
            releasedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          }
        : query.status === "expired"
          ? { releasedAt: null, expiresAt: { lte: now } }
          : query.status === "released"
            ? { releasedAt: { not: null } }
            : query.active === "true"
              ? { releasedAt: null }
              : query.active === "false"
                ? { releasedAt: { not: null } }
                : {};
    const where: Prisma.InventoryReservationWhereInput = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.refType ? { refType: query.refType } : {}),
      ...statusWhere,
      ...(search
        ? {
            OR: [
              { refId: { contains: search, mode: "insensitive" } },
              { notes: { contains: search, mode: "insensitive" } },
              {
                product: {
                  is: {
                    OR: [
                      { name: { contains: search, mode: "insensitive" } },
                      { code: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              },
              {
                warehouse: {
                  is: { name: { contains: search, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };
    const [total, reservations] = await prisma.$transaction([
      prisma.inventoryReservation.count({ where }),
      prisma.inventoryReservation.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { reservedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return c.json({
      data: reservations,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async create(c: Context): Promise<Response> {
    const context = { tenantId: requireTenantId(c), userId: requireUserId(c) };
    const reservation = await inventoryApplication.reserveStock.execute(
      context,
      parseReserveStock(await c.req.json<unknown>()),
    );
    return c.json({ data: reservation }, 201);
  },

  async createFromSalesOrder(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<SalesOrderReservationDTO>();
    const result = await reservationService.createSalesOrderReservations(
      tenantId,
      userId,
      {
        orderId: body.orderId,
        warehouseId: body.warehouseId,
        allowPartial: body.allowPartial ?? true,
        expiresAt: body.expiresAt ?? null,
      },
    );
    return c.json({ data: result }, 201);
  },

  async report(c: Context): Promise<Response> {
    return c.json({
      data: await reservationService.getReport(requireTenantId(c)),
    });
  },

  async releaseExpired(c: Context): Promise<Response> {
    return c.json({
      data: await reservationService.releaseExpired(requireTenantId(c)),
    });
  },

  async release(c: Context): Promise<Response> {
    const reservation = await inventoryApplication.releaseReservation.execute(
      requireTenantId(c),
      parseReleaseReservation(requireParam(c, "id")),
    );
    return c.json({ data: reservation });
  },
};
