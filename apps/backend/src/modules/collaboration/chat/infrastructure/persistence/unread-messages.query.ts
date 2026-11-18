import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { ChatContext } from "../../application/chat.types.js";
import { assertRawQueryTenant } from "../../../../../lib/tenant-isolation-context.js";

const countSchema = z.array(
  z.object({
    conversationId: z.string(),
    count: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
);

/** Match the per-room visibility predicate in one tenant-scoped statement. */
export async function unreadMessages(
  db: PrismaClient,
  context: ChatContext,
  conversationIds?: readonly string[],
): Promise<Map<string, number>> {
  assertRawQueryTenant(context.tenantId);
  if (conversationIds && !conversationIds.length) return new Map();
  const scope = conversationIds
    ? Prisma.sql`AND c.id IN (${Prisma.join([...conversationIds])})`
    : Prisma.sql`AND cm."notificationLevel" <> 'NONE'`;
  const rows = await db.$queryRaw<unknown[]>(Prisma.sql`
    SELECT c.id AS "conversationId",count(*)::text AS count
    FROM chat_conversation_members cm
    JOIN chat_conversations c ON c.id=cm."conversationId" AND c."tenantId"=cm."tenantId" AND c."deletedAt" IS NULL
    JOIN chat_messages m ON m."conversationId"=c.id AND m."tenantId"=cm."tenantId"
    WHERE cm."tenantId"=${context.tenantId} AND cm."userId"=${context.userId}
      AND cm."leftAt" IS NULL AND cm."archivedAt" IS NULL ${scope}
      AND m."senderId"<>${context.userId} AND m."deletedAt" IS NULL
      AND m."createdAt">greatest(cm."lastReadAt",cm."clearedAt",cm."visibleFrom",${new Date(0)})
    GROUP BY c.id
  `);
  return new Map(
    countSchema.parse(rows).map((row) => [row.conversationId, row.count]),
  );
}
