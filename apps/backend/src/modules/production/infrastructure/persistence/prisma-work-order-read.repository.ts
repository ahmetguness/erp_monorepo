import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  WorkOrderListQuery,
  WorkOrderReadRepository,
} from "../../application/ports/work-order-read.repository.js";

type WorkOrderListItem = Prisma.WorkOrderGetPayload<{
  include: {
    product: { select: { id: true; code: true; name: true } };
    bom: { select: { id: true; name: true; version: true } };
    _count: { select: { items: true; operations: true } };
  };
}>;

type WorkOrderDetail = Prisma.WorkOrderGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        code: true;
        name: true;
        purchasePrice: true;
        averageCost: true;
      };
    };
    bom: { select: { id: true; name: true; version: true } };
    inputWarehouse: { select: { id: true; code: true; name: true } };
    outputWarehouse: { select: { id: true; code: true; name: true } };
    items: {
      include: {
        product: {
          select: {
            id: true;
            code: true;
            name: true;
            purchasePrice: true;
            averageCost: true;
          };
        };
      };
    };
    operations: {
      include: { workCenter: { select: { id: true; code: true; name: true } } };
    };
    history: true;
  };
}>;

export class PrismaWorkOrderReadRepository implements WorkOrderReadRepository<
  WorkOrderListItem,
  WorkOrderDetail
> {
  constructor(private readonly db: PrismaClient) {}

  async list(criteria: WorkOrderListQuery) {
    const where = {
      tenantId: criteria.tenantId,
      deletedAt: null,
      ...(criteria.status ? { status: criteria.status } : {}),
    };
    const [total, items] = await this.db.$transaction([
      this.db.workOrder.count({ where }),
      this.db.workOrder.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          bom: { select: { id: true, name: true, version: true } },
          _count: { select: { items: true, operations: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
    ]);
    return { items, total };
  }

  findDetail(
    tenantId: string,
    workOrderId: string,
  ): Promise<WorkOrderDetail | null> {
    return this.db.workOrder.findFirst({
      where: { id: workOrderId, tenantId, deletedAt: null },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            purchasePrice: true,
            averageCost: true,
          },
        },
        bom: { select: { id: true, name: true, version: true } },
        inputWarehouse: { select: { id: true, code: true, name: true } },
        outputWarehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                name: true,
                purchasePrice: true,
                averageCost: true,
              },
            },
          },
        },
        operations: {
          include: {
            workCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: { stepOrder: "asc" },
        },
        history: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }
}
