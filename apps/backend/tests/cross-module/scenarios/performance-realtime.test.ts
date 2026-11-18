import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture, type TenantFixture } from '../support/fixtures.js';
import { request } from '../support/http.js';
import { createRealtimeReader } from '../../../src/modules/collaboration/chat/infrastructure/realtime/prisma-realtime-reader.js';
import type { RealtimeAudience } from '../../../src/modules/collaboration/chat/infrastructure/realtime/tenant-event-poller.js';
import { createSecuritySession, revokeSecuritySession } from '../../../src/services/security-hardening.service.js';
import { createApp } from '../../../src/bootstrap/http/create-app.js';
import { readRuntimeConfig } from '../../../src/bootstrap/runtime-config.js';
import { closeChatWebSockets, injectChatWebSocket } from '../../../src/modules/collaboration/chat/infrastructure/realtime/node-websocket-gateway.js';

isolatedDatabase();
const meta = { ipAddress: '127.0.0.1', userAgent: 'Phase81-isolated-test' };
const envelope = z.object({ tenantId: z.string(), payload: z.object({ clientMessageId: z.string() }) });
async function room(tenant: TenantFixture) {
  return db.chatConversation.create({ data: { tenantId: tenant.tenant.id, type: 'GROUP', createdById: tenant.owner.id,
    members: { create: { tenantId: tenant.tenant.id, userId: tenant.owner.id, role: 'OWNER' } } } });
}

test('membership notifications reach a current member even when the transaction timestamp predates visibleFrom', async () => {
  const { a } = await fixture(); const conversation = await room(a);
  const earlier = new Date(Date.now() - 1000);
  await db.chatRealtimeOutbox.createMany({ data: [
    { tenantId: a.tenant.id, conversationId: conversation.id, type: 'conversation.member_added', payload: {}, createdAt: earlier },
    { tenantId: a.tenant.id, conversationId: conversation.id, type: 'sync.required', payload: {}, createdAt: earlier },
    { tenantId: a.tenant.id, conversationId: conversation.id, type: 'message.created', payload: {}, createdAt: earlier },
  ] });
  const read = createRealtimeReader(db);
  const result = await read(a.tenant.id, [{ connectionId: 1, userId: a.owner.id, clientIp: '127.0.0.1' }], new Date(0), undefined, 500);
  expect(result.events.map((event) => event.type).sort()).toEqual(['conversation.member_added', 'sync.required']);
});

test('realtime batch checks current tenant, active membership, session, expiry and IP restrictions', async () => {
  const { a, b } = await fixture(); const own = await room(a); const foreign = await room(b);
  await db.chatRealtimeOutbox.createMany({ data: [own, foreign].map((conversation) => ({ tenantId: conversation.tenantId, conversationId: conversation.id, type: 'message.created', payload: {} })) });
  await db.chatRealtimeOutbox.create({ data: { tenantId: a.tenant.id, conversationId: own.id, type: 'message.created', payload: {}, createdAt: new Date(Date.now() - 60_000) } });
  const session = await createSecuritySession(db, a.tenant.id, a.owner.id, meta);
  const read = createRealtimeReader(db);
  const member: RealtimeAudience = { connectionId: 1, userId: a.owner.id, sessionId: session.id, clientIp: '127.0.0.1', expiresAt: Date.now() + 60_000 };
  const poll = () => read(a.tenant.id, [member, { ...member, connectionId: 2, userId: b.owner.id }], new Date(0), undefined, 500);
  expect(await poll()).toMatchObject({ authorizedIds: [1], events: [{ tenantId: a.tenant.id, recipientIds: [a.owner.id] }] });
  await db.chatConversationMember.update({ where: { conversationId_userId: { conversationId: own.id, userId: a.owner.id } }, data: { clearedAt: new Date(Date.now() + 1000) } });
  expect((await poll()).events).toEqual([]);
  await db.chatConversationMember.update({ where: { conversationId_userId: { conversationId: own.id, userId: a.owner.id } }, data: { leftAt: new Date() } });
  expect((await poll()).events).toEqual([]);
  await db.tenantSetting.createMany({ data: [{ tenantId: a.tenant.id, key: 'security.ip_restriction.enabled', value: 'true' }, { tenantId: a.tenant.id, key: 'security.ip_whitelist', value: '10.0.0.0/24' }] });
  expect((await poll()).authorizedIds).toEqual([]);
  member.clientIp = '10.0.0.8'; expect((await poll()).authorizedIds).toEqual([1]);
  member.expiresAt = Date.now() - 1; expect((await poll()).authorizedIds).toEqual([]);
  member.expiresAt = Date.now() + 60_000;
  await revokeSecuritySession(db, a.tenant.id, session.id, a.owner.id, meta);
  expect((await poll()).authorizedIds).toEqual([]);
  delete member.sessionId;
  await db.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.owner.id } }, data: { isActive: false } });
  expect((await poll()).authorizedIds).toEqual([]);
});

test('independent Node websocket gateways deliver one durable message across replicas without foreign-tenant data', async () => {
  const { a, b } = await fixture(); const own = await room(a); const foreign = await room(b);
  const apps = [createApp(readRuntimeConfig()), createApp(readRuntimeConfig())];
  const servers = apps.map((app) => {
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }); injectChatWebSocket(app, server); return server;
  });
  const sockets: WebSocket[] = [];
  const received: Array<Array<z.infer<typeof envelope>>> = [[], [], []];
  try {
    const clients = [{ server: servers[0], identity: a.identity }, { server: servers[1], identity: a.identity }, { server: servers[0], identity: b.identity }];
    for (const [i, { server, identity }] of clients.entries()) {
      if (!server.listening) await once(server, 'listening');
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP listener.');
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/chat/ws?token=${encodeURIComponent(identity.token)}`); sockets.push(socket);
      socket.addEventListener('message', (event: MessageEvent<unknown>) => { if (typeof event.data === 'string') { const parsed = envelope.safeParse(JSON.parse(event.data) as unknown); if (parsed.success) received[i].push(parsed.data); } });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Websocket handshake timeout.')), 5000);
        socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Websocket handshake failed.')); }, { once: true });
      });
    }
    const clientMessageId = randomUUID();
    expect((await request('POST', `/api/chat/conversations/${own.id}/messages`, a.identity, { clientMessageId, content: 'Durable cross replica message' })).status).toBe(201);
    expect((await request('POST', `/api/chat/conversations/${foreign.id}/messages`, b.identity, { clientMessageId: randomUUID(), content: 'Foreign message' })).status).toBe(201);
    await expect.poll(() => received.map((events) => events.filter((event) => event.payload.clientMessageId === clientMessageId).length), { timeout: 6000 }).toEqual([1, 1, 0]);
    await expect.poll(() => received[2].length, { timeout: 6000 }).toBe(1);
    expect(received.slice(0, 2).flat().every((event) => event.tenantId === a.tenant.id)).toBe(true);
    expect(received[2].every((event) => event.tenantId === b.tenant.id)).toBe(true);
    const closed = sockets.slice(0, 2).map((socket) => new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code), { once: true })));
    await db.tenantUser.update({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.owner.id } }, data: { isActive: false } });
    await expect.poll(() => sockets.slice(0, 2).every((socket) => socket.readyState === WebSocket.CLOSED), { timeout: 6000 }).toBe(true);
    expect(await Promise.all(closed)).toEqual([1008, 1008]);
    expect(sockets[2].readyState).toBe(WebSocket.OPEN);
  } finally {
    for (const socket of sockets) socket.close();
    await Promise.all(apps.map(closeChatWebSockets));
    await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  }
});
