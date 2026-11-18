import { Plan, Prisma, TenantStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveSecuritySessions } from "../../../../../services/security-hardening.service.js";
import { isIpv4InCidr } from "../../../../../utils/request-ip.js";
import {
  assertRawQueryTenant,
  runWithTenantScope,
} from "../../../../../lib/tenant-isolation-context.js";
import type { RealtimeReader } from "./tenant-event-poller.js";

const infoSchema = z.object({
  plan: z.nativeEnum(Plan),
  status: z.nativeEnum(TenantStatus),
  activeUsers: z.array(z.string()),
  settings: z.array(z.object({ key: z.string(), value: z.string() })),
});
const eventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  conversationId: z.string(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.date(),
  recipientIds: z.array(z.string()),
});

export function createRealtimeReader(db: PrismaClient): RealtimeReader {
  // The shared timer may inherit another connection's async context. Bind each
  // batch to its authenticated channel before checking or reading its tenant.
  return (tenantId, audience, since, after, limit) =>
    runWithTenantScope(tenantId, async () => {
      assertRawQueryTenant(tenantId);
      const users = [...new Set(audience.map((member) => member.userId))];
      if (!users.length) return { authorizedIds: [], events: [] };
      const rows = await db.$queryRaw<unknown[]>(Prisma.sql`
      SELECT t.plan,t.status,
        ARRAY(SELECT tu."userId" FROM tenant_users tu JOIN users u ON u.id=tu."userId"
          WHERE tu."tenantId"=t.id AND tu."userId" IN (${Prisma.join(users)}) AND tu."isActive" AND u."isActive") AS "activeUsers",
        coalesce((SELECT jsonb_agg(jsonb_build_object('key',s.key,'value',s.value)) FROM tenant_settings s
          WHERE s."tenantId"=t.id AND s.key IN ('security.sessions','security.session.max_age_days','security.session.idle_timeout_mins','security.ip_restriction.enabled','security.ip_whitelist')),'[]'::jsonb) AS settings
      FROM tenants t WHERE t.id=${tenantId} AND t."deletedAt" IS NULL
    `);
      if (!rows.length) return { authorizedIds: [], events: [] };
      const info = infoSchema.parse(rows[0]);
      const now = new Date();
      if (info.status !== "ACTIVE" && info.status !== "TRIAL")
        return { authorizedIds: [], events: [] };
      const active = new Set(info.activeUsers);
      const sessions = new Map(
        resolveSecuritySessions(info.settings, now).map((session) => [
          session.id,
          session,
        ]),
      );
      const settings = new Map(
        info.settings.map((setting) => [setting.key, setting.value]),
      );
      const ips = (settings.get("security.ip_whitelist") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const authorized = audience.filter((member) => {
        if (
          !active.has(member.userId) ||
          (member.expiresAt !== undefined && member.expiresAt <= now.getTime())
        )
          return false;
        if (member.sessionId) {
          const session = sessions.get(member.sessionId);
          if (
            !session ||
            session.userId !== member.userId ||
            session.tenantId !== tenantId ||
            session.status !== "ACTIVE"
          )
            return false;
        }
        return (
          info.plan !== "ENTERPRISE" ||
          settings.get("security.ip_restriction.enabled") !== "true" ||
          !ips.length ||
          ips.some((ip) =>
            ip.includes("/")
              ? isIpv4InCidr(member.clientIp, ip)
              : ip === member.clientIp,
          )
        );
      });
      const authorizedIds = authorized.map((member) => member.connectionId);
      if (!authorizedIds.length) return { authorizedIds, events: [] };
      const userIds = [...new Set(authorized.map((member) => member.userId))];
      const cursor = after
        ? Prisma.sql`AND (e."createdAt">${after.createdAt} OR (e."createdAt"=${after.createdAt} AND e.id>${after.id}))`
        : Prisma.empty;
      const events = await db.$queryRaw<unknown[]>(Prisma.sql`
      SELECT e.id,e."tenantId",e."conversationId",e.type,e.payload,e."createdAt",a.users AS "recipientIds"
      FROM chat_realtime_outbox e
      CROSS JOIN LATERAL (SELECT array_agg(m."userId") AS users FROM chat_conversation_members m
        WHERE m."tenantId"=e."tenantId" AND m."conversationId"=e."conversationId" AND m."leftAt" IS NULL
          AND (e.type LIKE 'conversation.%' OR e.type='sync.required' OR e."createdAt">=greatest(m."visibleFrom",m."clearedAt"))
          AND m."userId" IN (${Prisma.join(userIds)})) a
      WHERE e."tenantId"=${tenantId} AND e."createdAt">=${since} ${cursor} AND a.users IS NOT NULL
      ORDER BY e."createdAt",e.id LIMIT ${limit}
    `);
      return { authorizedIds, events: z.array(eventSchema).parse(events) };
    });
}
