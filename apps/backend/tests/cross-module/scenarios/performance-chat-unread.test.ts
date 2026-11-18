import { PrismaClient } from '@prisma/client';
import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { PrismaChatRepository } from '../../../src/modules/collaboration/chat/infrastructure/persistence/prisma-chat.repository.js';
import { runWithTenantScope } from '../../../src/lib/tenant-isolation-context.js';

isolatedDatabase();

test('chat unread aggregation preserves visibility and uses bounded queries for twenty rooms', async () => {
  const { a, b, user } = await fixture(); const visibleFrom = new Date('2020-01-01');
  const rooms: Array<{ id: string }> = [];
  for (let i = 0; i < 20; i++) rooms.push(await db.chatConversation.create({ data: {
    tenantId: a.tenant.id, type: 'GROUP', createdById: a.owner.id,
    members: { create: [{ tenantId: a.tenant.id, userId: a.owner.id, visibleFrom }, { tenantId: a.tenant.id, userId: user.id, visibleFrom }] },
    messages: { create: [a.owner.id, user.id, user.id].map((senderId, j) => ({ tenantId: a.tenant.id, senderId, content: 'Synthetic unread control', clientMessageId: `${i}-${j}` })) },
  } }));
  const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  let queries = 0; client.$on('query', () => queries++);
  const repository = new PrismaChatRepository(client); const context = { tenantId: a.tenant.id, userId: a.owner.id };
  try {
    await client.$connect(); queries = 0; const start = performance.now();
    expect(await repository.getUnreadCount(context)).toBe(40);
    const unreadQueries = queries; const unreadMs = performance.now() - start;
    queries = 0; const listStart = performance.now();
    const page = await repository.listConversations(context, undefined, 20);
    const listMs = performance.now() - listStart; const listQueries = queries;
    expect(page.items).toHaveLength(20); expect(page.items.every((row) => row.unreadCount === 2)).toBe(true);
    console.info(JSON.stringify({ control: 'twenty-room-unread', unreadQueries, unreadMs, listQueries, listMs }));
    expect(unreadQueries).toBe(1);
    expect(listQueries).toBeLessThanOrEqual(13);
    await db.chatConversationMember.update({ where: { conversationId_userId: { conversationId: rooms[0].id, userId: a.owner.id } }, data: { notificationLevel: 'NONE' } });
    await db.chatConversationMember.update({ where: { conversationId_userId: { conversationId: rooms[1].id, userId: a.owner.id } }, data: { archivedAt: new Date() } });
    await db.chatConversationMember.update({ where: { conversationId_userId: { conversationId: rooms[2].id, userId: a.owner.id } }, data: { clearedAt: new Date(Date.now() + 1000) } });
    await db.chatConversationMember.update({ where: { conversationId_userId: { conversationId: rooms[3].id, userId: a.owner.id } }, data: { leftAt: new Date() } });
    await db.chatMessage.updateMany({ where: { conversationId: rooms[4].id }, data: { deletedAt: new Date() } });
    expect(await repository.getUnreadCount(context)).toBe(30);
    const changed = await repository.listConversations(context, undefined, 20);
    expect(changed.items.find((row) => row.id === rooms[0].id)?.unreadCount).toBe(2);
    expect(changed.items.find((row) => row.id === rooms[2].id)?.unreadCount).toBe(0);
    expect(changed.items).toHaveLength(18);
    expect(await repository.getUnreadCount({ tenantId: b.tenant.id, userId: a.owner.id })).toBe(0);
    await expect(runWithTenantScope(b.tenant.id, () => repository.getUnreadCount(context))).rejects.toThrow('Tenant isolation violation');
  } finally { await client.$disconnect(); }
});
