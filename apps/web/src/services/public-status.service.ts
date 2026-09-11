import { z } from "zod";
import type { PublicStatusIncident } from "@repo/types";

const incidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["SEV1", "SEV2", "SEV3"]),
  status: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]),
  latestMessage: z.string(),
  publishedAt: z.string(),
});
const responseSchema = z.object({ data: z.array(incidentSchema) });

export async function getPublicStatus(): Promise<PublicStatusIncident[]> {
  const response = await fetch("/api/status/incidents", { cache: "no-store" });
  if (!response.ok) throw new Error("Durum bilgisi alınamadı.");
  return responseSchema.parse(await response.json()).data;
}
