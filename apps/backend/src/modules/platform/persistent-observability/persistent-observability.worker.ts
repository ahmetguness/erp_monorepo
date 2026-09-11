import { prisma } from "../../../lib/prisma.js";
import { getObservabilitySnapshot } from "../../../services/observability.service.js";
import { WorkerLoop } from "../../shared/infrastructure/worker-loop.js";
import { capturePersistentSnapshot } from "./persistent-observability.service.js";

const loop = new WorkerLoop("PersistentObservabilityWorker", 60_000, async () => {
  await capturePersistentSnapshot(await getObservabilitySnapshot(prisma));
});

export const PersistentObservabilityWorker = {
  start(): void { loop.start(); },
  stop(): Promise<void> { return loop.stop(); },
};
