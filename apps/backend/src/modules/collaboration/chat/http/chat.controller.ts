import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { prisma } from '../../../../lib/prisma.js';
import { requireParam, requireTenantId, requireUserId } from '../../../../utils/context.js';
import { ChatService } from '../application/index.js';
import { PrismaChatRepository } from '../infrastructure/persistence/index.js';
import { chatSchemas, parseBody } from './chat.schemas.js';
import { StoragePlanResolver } from '../../../storage-accounting/index.js';

const service = new ChatService(new PrismaChatRepository(prisma), new StoragePlanResolver(prisma));
const contextOf = (context: Context) => ({ tenantId: requireTenantId(context), userId: requireUserId(context) });
const bodyOf = (context: Context): Promise<unknown> => context.req.json<unknown>();
const numberQuery = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const optionalDate = (value: string | undefined): Date | undefined => value ? new Date(value) : undefined;

export const ChatController = {
  async unreadCount(c: Context): Promise<Response> {
    return c.json({ data: { count: await service.getUnreadCount(contextOf(c)) } });
  },
  async listConversations(c: Context): Promise<Response> {
    return c.json({ data: await service.listConversations(contextOf(c), c.req.query('cursor'), numberQuery(c.req.query('limit'), 30)) });
  },
  async createDirect(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.direct, await bodyOf(c));
    return c.json({ data: await service.createDirect(contextOf(c), body.userId) }, 201);
  },
  async createGroup(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.group, await bodyOf(c));
    return c.json({ data: await service.createGroup(contextOf(c), body) }, 201);
  },
  async getConversation(c: Context): Promise<Response> {
    return c.json({ data: await service.getConversation(contextOf(c), requireParam(c, 'conversationId')) });
  },
  async updateConversation(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.updateConversation, await bodyOf(c));
    return c.json({ data: await service.updateConversation(contextOf(c), requireParam(c, 'conversationId'), body) });
  },
  async listMessages(c: Context): Promise<Response> {
    return c.json({ data: await service.listMessages(contextOf(c), requireParam(c, 'conversationId'), c.req.query('cursor'), numberQuery(c.req.query('limit'), 50)) });
  },
  async sendMessage(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.send, await bodyOf(c));
    return c.json({ data: await service.sendMessage(contextOf(c), requireParam(c, 'conversationId'), body) }, 201);
  },
  async editMessage(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.edit, await bodyOf(c));
    return c.json({ data: await service.editMessage(contextOf(c), requireParam(c, 'messageId'), body.content, body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : undefined) });
  },
  async deleteMessage(c: Context): Promise<Response> {
    return c.json({ data: await service.deleteMessage(contextOf(c), requireParam(c, 'messageId')) });
  },
  async forwardMessage(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.forward, await bodyOf(c));
    return c.json({ data: await service.forwardMessage(contextOf(c), requireParam(c, 'messageId'), body.conversationIds) }, 201);
  },
  async markRead(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.read, await bodyOf(c));
    await service.markRead(contextOf(c), requireParam(c, 'conversationId'), body.messageId);
    return c.json({ data: { success: true } });
  },
  async pinConversation(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.pin, await bodyOf(c));
    await service.pinConversation(contextOf(c), requireParam(c, 'conversationId'), body.pinned);
    return c.json({ data: { success: true } });
  },
  async muteConversation(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.mute, await bodyOf(c));
    await service.muteConversation(contextOf(c), requireParam(c, 'conversationId'), body.mutedUntil ? new Date(body.mutedUntil) : null, body.notificationLevel);
    return c.json({ data: { success: true } });
  },
  async archiveConversation(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.pin, await bodyOf(c));
    await service.archiveConversation(contextOf(c), requireParam(c, 'conversationId'), body.pinned);
    return c.json({ data: { success: true } });
  },
  async clearConversation(c: Context): Promise<Response> {
    await service.clearConversation(contextOf(c), requireParam(c, 'conversationId'));
    return c.json({ data: { success: true } });
  },
  async setStar(c: Context): Promise<Response> {
    await service.setStar(contextOf(c), requireParam(c, 'messageId'), c.req.method === 'PUT');
    return c.json({ data: { success: true } });
  },
  async setMessagePin(c: Context): Promise<Response> {
    await service.setMessagePin(contextOf(c), requireParam(c, 'messageId'), c.req.method === 'PUT');
    return c.json({ data: { success: true } });
  },
  async setReaction(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.reaction, await bodyOf(c));
    await service.setReaction(contextOf(c), requireParam(c, 'messageId'), body.emoji, c.req.method === 'PUT');
    return c.json({ data: { success: true } });
  },
  async search(c: Context): Promise<Response> {
    const from = optionalDate(c.req.query('from')); const to = optionalDate(c.req.query('to'));
    return c.json({ data: await service.search(contextOf(c), {
      q: c.req.query('q') ?? '', conversationId: c.req.query('conversationId'), senderId: c.req.query('senderId'),
      hasAttachment: c.req.query('hasAttachment') === 'true' ? true : undefined, cursor: c.req.query('cursor'),
      from, to, limit: numberQuery(c.req.query('limit'), 50),
    }) });
  },
  async addMembers(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.addMembers, await bodyOf(c));
    await service.addMembers(contextOf(c), requireParam(c, 'conversationId'), body.userIds);
    return c.json({ data: { success: true } }, 201);
  },
  async removeMember(c: Context): Promise<Response> {
    await service.removeMember(contextOf(c), requireParam(c, 'conversationId'), requireParam(c, 'userId'));
    return c.json({ data: { success: true } });
  },
  async updateMemberRole(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.memberRole, await bodyOf(c));
    await service.updateMemberRole(contextOf(c), requireParam(c, 'conversationId'), requireParam(c, 'userId'), body.role);
    return c.json({ data: { success: true } });
  },
  async createInvite(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.invite, await bodyOf(c));
    return c.json({ data: await service.createInvite(contextOf(c), requireParam(c, 'conversationId'), body.inviteeId, body.expiresAt ? new Date(body.expiresAt) : undefined) }, 201);
  },
  async respondInvite(c: Context): Promise<Response> {
    await service.respondInvite(contextOf(c), requireParam(c, 'inviteId'), requireParam(c, 'decision') === 'accept');
    return c.json({ data: { success: true } });
  },
  async createPoll(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.poll, await bodyOf(c));
    return c.json({ data: await service.createPoll(contextOf(c), requireParam(c, 'conversationId'), { ...body, closesAt: body.closesAt ? new Date(body.closesAt) : null }) }, 201);
  },
  async votePoll(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.vote, await bodyOf(c));
    await service.votePoll(contextOf(c), requireParam(c, 'pollId'), body.optionIds);
    return c.json({ data: { success: true } });
  },
  async closePoll(c: Context): Promise<Response> {
    await service.closePoll(contextOf(c), requireParam(c, 'pollId'));
    return c.json({ data: { success: true } });
  },
  async createEvent(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.event, await bodyOf(c));
    return c.json({ data: await service.createEvent(contextOf(c), requireParam(c, 'conversationId'), { ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) }) }, 201);
  },
  async respondEvent(c: Context): Promise<Response> {
    const body = parseBody(chatSchemas.eventResponse, await bodyOf(c));
    await service.respondEvent(contextOf(c), requireParam(c, 'eventId'), body.status);
    return c.json({ data: { success: true } });
  },
  async realtime(c: Context): Promise<Response> {
    const context = contextOf(c);
    const after = c.req.header('Last-Event-ID') ?? c.req.query('after');
    return streamSSE(c, async (stream) => {
      let cursor = after;
      let active = true;
      stream.onAbort(() => { active = false; });
      while (active) {
        const events = await prisma.chatRealtimeOutbox.findMany({
          where: { tenantId: context.tenantId, ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}), conversation: { members: { some: { userId: context.userId, leftAt: null } } } },
          orderBy: { createdAt: 'asc' }, take: 100,
        });
        for (const event of events) {
          cursor = event.createdAt.toISOString();
          await stream.writeSSE({ id: cursor, event: event.type, data: JSON.stringify({ id: event.id, type: event.type, tenantId: event.tenantId, conversationId: event.conversationId, occurredAt: cursor, version: 1, payload: event.payload }) });
        }
        if (events.length === 0) await stream.writeSSE({ event: 'heartbeat', data: '{}' });
        await stream.sleep(2_000);
      }
    });
  },
};
