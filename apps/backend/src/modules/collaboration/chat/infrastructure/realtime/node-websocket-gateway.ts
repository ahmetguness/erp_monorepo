import { createNodeWebSocket } from '@hono/node-ws';
import type { ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import { prisma } from '../../../../../lib/prisma.js';
import { runWithTenantScope } from '../../../../../lib/tenant-isolation-context.js';
import { requireAuth } from '../../../../../middleware/requireAuth.js';
import { requireActiveTrial } from '../../../../../middleware/require-active-trial.js';
import { requireTenantId, requireUserId } from '../../../../../utils/context.js';
import { ForbiddenError } from '../../../../../errors/index.js';
import { WebSocketConnections } from './websocket-connections.js';

const injectors = new WeakMap<Hono, (server: ServerType) => void>();
const connections = new WeakMap<Hono, WebSocketConnections>();

function sendJson(socket: WSContext, value: unknown): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(value));
}

export function registerChatWebSocket(app: Hono, allowedOrigins: readonly string[], isProduction: boolean): void {
  const sockets = new WebSocketConnections();
  connections.set(app, sockets);
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  injectors.set(app, (server) => injectWebSocket(server));
  app.use('/api/chat/ws', async (context, next) => {
    const origin = context.req.header('Origin');
    const isMobile = context.req.header('X-Client-Platform') === 'mobile' || !origin;
    const localOrigin = !isProduction && origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!isMobile && (!allowedOrigins.includes(origin!) && !localOrigin)) {
      return context.json(new ForbiddenError('WebSocket origin reddedildi.').toJSON(), 403);
    }
    await next();
  });
  app.use('/api/chat/ws', requireAuth, requireActiveTrial, async (context, next) => {
    if (sockets.isDraining) return context.body(null, 503);
    await next();
  });
  app.get('/api/chat/ws', upgradeWebSocket((context) => {
    const tenantId = requireTenantId(context); const userId = requireUserId(context);
    let cursor = new Date(); let timer: ReturnType<typeof setInterval> | undefined;
    const poll = async (socket: WSContext): Promise<void> => runWithTenantScope(tenantId, async () => {
      const events = await prisma.chatRealtimeOutbox.findMany({
        where: { tenantId, createdAt: { gt: cursor }, conversation: { members: { some: { userId, leftAt: null } } } },
        orderBy: { createdAt: 'asc' }, take: 100,
      });
      for (const event of events) {
        cursor = event.createdAt;
        sendJson(socket, { id: event.id, type: event.type, tenantId, conversationId: event.conversationId, occurredAt: event.createdAt.toISOString(), version: 1, payload: event.payload });
      }
    });
    return {
      onOpen: (_event, socket) => {
        sockets.add(socket);
        if (sockets.isDraining) return;
        sendJson(socket, { type: 'connection.ready', occurredAt: new Date().toISOString() });
        timer = setInterval(() => { void poll(socket).catch(() => socket.close(1011, 'Realtime polling failed')); }, 1_000);
      },
      onMessage: (event, socket) => { if (event.data === 'ping') sendJson(socket, { type: 'pong', occurredAt: new Date().toISOString() }); },
      onClose: (_event, socket) => { sockets.remove(socket); if (timer) clearInterval(timer); },
      onError: (_event, socket) => { if (timer) clearInterval(timer); socket.close(1011, 'Realtime connection failed'); },
    };
  }));
}

export function closeChatWebSockets(app: Hono): Promise<void> {
  return connections.get(app)?.drain() ?? Promise.resolve();
}

export function injectChatWebSocket(app: Hono, server: ServerType): void {
  injectors.get(app)?.(server);
}
