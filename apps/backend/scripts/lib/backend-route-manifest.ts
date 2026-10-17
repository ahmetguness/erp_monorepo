import type { Hono } from 'hono';
import { createApp } from '../../src/bootstrap/http/create-app.js';

export type BackendHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface BackendRouteManifestEntry {
  method: BackendHttpMethod;
  path: string;
}

const HTTP_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

function isBackendHttpMethod(method: string): method is BackendHttpMethod {
  return HTTP_METHODS.has(method);
}

function routeKey(route: BackendRouteManifestEntry): string {
  return `${route.method} ${route.path}`;
}

export function createBackendRouteManifest(): BackendRouteManifestEntry[] {
  const app: Hono = createApp({
    port: 3001,
    isProduction: false,
    role: 'api',
    allowedOrigins: ['http://localhost:3000'],
  });

  const uniqueRoutes = new Map<string, BackendRouteManifestEntry>();
  for (const route of app.routes) {
    if (!isBackendHttpMethod(route.method)) continue;
    const entry = { method: route.method, path: route.path };
    uniqueRoutes.set(routeKey(entry), entry);
  }

  return [...uniqueRoutes.values()].sort((left, right) =>
    routeKey(left).localeCompare(routeKey(right)),
  );
}

