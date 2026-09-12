import { prisma } from "../../../lib/prisma.js";

const TTL_MS = 24 * 60 * 60 * 1000;
export type IdempotencyClaim =
  | { kind: "CLAIMED"; id: string }
  | {
      kind: "REPLAY";
      statusCode: number;
      contentType: string;
      responseBody: string;
    }
  | { kind: "CONFLICT" }
  | { kind: "PROCESSING" };

export async function claimAdminRequest(input: {
  adminId: string;
  method: string;
  path: string;
  key: string;
  requestHash: string;
}): Promise<IdempotencyClaim> {
  const scope = `${input.adminId}:${input.method}:${input.path}:${input.key}`;
  return prisma.$transaction(async (tx): Promise<IdempotencyClaim> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`;
    let existing = await tx.adminIdempotencyRecord.findUnique({
      where: {
        adminId_method_path_key: {
          adminId: input.adminId,
          method: input.method,
          path: input.path,
          key: input.key,
        },
      },
    });
    if (existing?.expiresAt && existing.expiresAt <= new Date()) {
      await tx.adminIdempotencyRecord.delete({ where: { id: existing.id } });
      existing = null;
    }
    if (!existing) {
      const record = await tx.adminIdempotencyRecord.create({
        data: { ...input, expiresAt: new Date(Date.now() + TTL_MS) },
      });
      return { kind: "CLAIMED", id: record.id };
    }
    if (existing.requestHash !== input.requestHash) return { kind: "CONFLICT" };
    if (
      existing.state !== "COMPLETED" ||
      existing.statusCode === null ||
      existing.responseBody === null
    )
      return { kind: "PROCESSING" };
    return {
      kind: "REPLAY",
      statusCode: existing.statusCode,
      contentType: existing.contentType ?? "application/json; charset=UTF-8",
      responseBody: existing.responseBody,
    };
  });
}

export async function completeAdminRequest(
  id: string,
  response: { statusCode: number; contentType: string; responseBody: string },
): Promise<void> {
  await prisma.adminIdempotencyRecord.update({
    where: { id },
    data: { state: "COMPLETED", ...response },
  });
}

export async function abandonAdminRequest(id: string): Promise<void> {
  await prisma.adminIdempotencyRecord.deleteMany({
    where: { id, state: "PROCESSING" },
  });
}
