import { prisma } from "../../lib/prisma.js";
import { WorkOrderQueries } from "./application/queries/work-order.queries.js";
import { PrismaWorkOrderReadRepository } from "./infrastructure/persistence/prisma-work-order-read.repository.js";

const workOrderReadRepository = new PrismaWorkOrderReadRepository(prisma);

export const productionApplication = {
  workOrderQueries: new WorkOrderQueries(workOrderReadRepository),
} as const;
