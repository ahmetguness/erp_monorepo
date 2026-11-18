import { createNodeWebSocket } from "@hono/node-ws";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { prisma } from "../../../../../lib/prisma.js";
import { requireAuth } from "../../../../../middleware/requireAuth.js";
import { requireActiveTrial } from "../../../../../middleware/require-active-trial.js";
import {
  requireTenantId,
  requireUserId,
} from "../../../../../utils/context.js";
import { ForbiddenError } from "../../../../../errors/index.js";
import { WebSocketConnections } from "./websocket-connections.js";
import { trackRealtimeConnection } from "../../../../../lib/runtime-performance.js";
import { getTrustedClientIp } from "../../../../../utils/request-ip.js";
import { TenantEventPoller } from "./tenant-event-poller.js";
import { createRealtimeReader } from "./prisma-realtime-reader.js";
import { logger } from "../../../../../lib/logger.js";

const injectors = new WeakMap<Hono, (server: ServerType) => void>();
const connections = new WeakMap<Hono, WebSocketConnections>();
const pollers = new WeakMap<Hono, TenantEventPoller>();

function sendJson(socket: WSContext, value: unknown): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(value));
}

export function registerChatWebSocket(
  app: Hono,
  allowedOrigins: readonly string[],
  isProduction: boolean,
): void {
  const sockets = new WebSocketConnections();
  const poller = new TenantEventPoller(
    createRealtimeReader(prisma),
    (error, tenantId) => {
      logger.error("[ChatRealtime] Polling failed; connections closed.", {
        tenantId,
        errorName: error instanceof Error ? error.name : "Unknown",
        code:
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : null,
      });
    },
  );
  pollers.set(app, poller);
  connections.set(app, sockets);
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  injectors.set(app, (server) => injectWebSocket(server));
  app.use("/api/chat/ws", async (context, next) => {
    const origin = context.req.header("Origin");
    const isMobile =
      context.req.header("X-Client-Platform") === "mobile" || !origin;
    const localOrigin =
      !isProduction &&
      origin &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!isMobile && !allowedOrigins.includes(origin!) && !localOrigin) {
      return context.json(
        new ForbiddenError("WebSocket origin reddedildi.").toJSON(),
        403,
      );
    }
    await next();
  });
  app.use(
    "/api/chat/ws",
    requireAuth,
    requireActiveTrial,
    async (context, next) => {
      if (sockets.isDraining) return context.body(null, 503);
      await next();
    },
  );
  app.get(
    "/api/chat/ws",
    upgradeWebSocket((context) => {
      const tenantId = requireTenantId(context);
      const userId = requireUserId(context);
      const session: unknown = context.get("sessionId");
      const expiry: unknown = context.get("authenticationExpiresAt");
      let unsubscribe: (() => void) | undefined;
      let untrack: (() => void) | undefined;
      return {
        onOpen: (_event, socket) => {
          sockets.add(socket);
          if (sockets.isDraining) return;
          untrack = trackRealtimeConnection();
          unsubscribe = poller.subscribe(tenantId, {
            userId,
            clientIp: getTrustedClientIp(context),
            ...(typeof session === "string" ? { sessionId: session } : {}),
            ...(typeof expiry === "number" ? { expiresAt: expiry } : {}),
            close: (code, reason) => socket.close(code, reason),
            send: (message) => {
              if (socket.readyState !== 1) return false;
              const raw: unknown = socket.raw;
              if (
                raw &&
                typeof raw === "object" &&
                "bufferedAmount" in raw &&
                typeof raw.bufferedAmount === "number" &&
                raw.bufferedAmount > 262_144
              )
                return false;
              try {
                socket.send(message);
                return true;
              } catch {
                return false;
              }
            },
          });
          sendJson(socket, {
            type: "connection.ready",
            occurredAt: new Date().toISOString(),
          });
        },
        onMessage: (event, socket) => {
          if (event.data === "ping")
            sendJson(socket, {
              type: "pong",
              occurredAt: new Date().toISOString(),
            });
        },
        onClose: (_event, socket) => {
          sockets.remove(socket);
          unsubscribe?.();
          untrack?.();
        },
        onError: (_event, socket) => {
          unsubscribe?.();
          socket.close(1011, "Realtime connection failed");
        },
      };
    }),
  );
}

export function closeChatWebSockets(app: Hono): Promise<void> {
  pollers.get(app)?.stop();
  return connections.get(app)?.drain() ?? Promise.resolve();
}

export function injectChatWebSocket(app: Hono, server: ServerType): void {
  injectors.get(app)?.(server);
}
