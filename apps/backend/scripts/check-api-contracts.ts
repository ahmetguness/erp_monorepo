import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CheckIssue,
  joinRoutePath,
  normalizePath,
  readText,
  reportIssues,
  toProjectPath,
  walkFiles,
} from './lib/static-checks';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface BackendRoute {
  method: HttpMethod;
  path: string;
}

interface WebEndpoint {
  method: HttpMethod | 'ANY';
  path: string;
  file: string;
}

function normalizeTemplatePath(path: string): string {
  return normalizePath(path.replace(/\$\{[^}]+\}/g, ':param'));
}

function routeMatches(endpoint: WebEndpoint, route: BackendRoute): boolean {
  if (endpoint.method !== 'ANY' && endpoint.method !== route.method) return false;

  const endpointParts = normalizePath(endpoint.path).split('/').filter(Boolean);
  const routeParts = normalizePath(route.path).split('/').filter(Boolean);
  if (endpointParts.length !== routeParts.length) return false;

  return routeParts.every((part, index) => {
    const endpointPart = endpointParts[index];
    return part.startsWith(':') || endpointPart.startsWith(':') || part === endpointPart;
  });
}

function extractRouteImports(indexText: string): Map<string, string> {
  const imports = new Map<string, string>();
  const importRegex = /import\s+\{\s*([A-Za-z0-9_,\s]+)\s*\}\s+from\s+'\.\/routes\/([^']+)'/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(indexText)) !== null) {
    const names = match[1].split(',').map((name) => name.trim()).filter(Boolean);
    const routeFile = match[2];
    for (const name of names) {
      imports.set(name, routeFile);
    }
  }

  return imports;
}

function extractMountedRoutes(indexText: string): Map<string, string> {
  const mounts = new Map<string, string>();
  const mountRegex = /(app|tenantApi)\.route\('([^']+)',\s*([A-Za-z0-9_]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = mountRegex.exec(indexText)) !== null) {
    const host = match[1];
    const base = match[2];
    const routeVar = match[3];
    mounts.set(routeVar, host === 'tenantApi' ? joinRoutePath('/api', base) : normalizePath(base));
  }

  return mounts;
}

function extractDirectIndexRoutes(indexText: string): BackendRoute[] {
  const routes: BackendRoute[] = [];
  const directRegex = /(app|tenantApi)\.(get|post|put|patch|delete)\('([^']+)'/g;
  let match: RegExpExecArray | null;

  while ((match = directRegex.exec(indexText)) !== null) {
    const host = match[1];
    const method = match[2].toUpperCase() as HttpMethod;
    const path = host === 'tenantApi' ? joinRoutePath('/api', match[3]) : normalizePath(match[3]);
    routes.push({ method, path });
  }

  return routes;
}

function extractBackendRoutes(): BackendRoute[] {
  const backendSrc = resolve(process.cwd(), 'src');
  const indexPath = join(backendSrc, 'index.ts');
  const indexText = readText(indexPath);
  const imports = extractRouteImports(indexText);
  const mounts = extractMountedRoutes(indexText);
  const routes = extractDirectIndexRoutes(indexText);

  for (const [routeVar, base] of mounts) {
    const importPath = imports.get(routeVar);
    if (!importPath) continue;

    const file = join(backendSrc, 'routes', `${importPath}.ts`);
    if (!existsSync(file)) continue;

    const text = readText(file);
    const routeRegex = new RegExp(`${routeVar}\\.(get|post|put|patch|delete)\\('([^']+)'`, 'g');
    let match: RegExpExecArray | null;

    while ((match = routeRegex.exec(text)) !== null) {
      routes.push({
        method: match[1].toUpperCase() as HttpMethod,
        path: joinRoutePath(base, match[2]),
      });
    }
  }

  return routes;
}

function extractWebEndpoints(): WebEndpoint[] {
  const webRoot = resolve(process.cwd(), '..', 'web', 'src');
  const files = [
    ...walkFiles(join(webRoot, 'services'), ['.ts', '.tsx']),
    ...walkFiles(join(webRoot, 'hooks'), ['.ts', '.tsx']),
    ...walkFiles(join(webRoot, 'components', 'features'), ['.ts', '.tsx']),
    ...walkFiles(join(webRoot, 'components', 'shared'), ['.ts', '.tsx']),
  ];
  const endpoints: WebEndpoint[] = [];

  for (const file of files) {
    const text = readText(file);
    const apiClientRegex = /\b(?:apiClient|adminApiClient)\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\(\s*(['"`])([^'"`]+)\2/g;
    let clientMatch: RegExpExecArray | null;

    while ((clientMatch = apiClientRegex.exec(text)) !== null) {
      const rawPath = clientMatch[3];
      if (!rawPath.includes('/api/')) continue;
      endpoints.push({
        method: clientMatch[1].toUpperCase() as HttpMethod,
        path: normalizeTemplatePath(rawPath.slice(rawPath.indexOf('/api/'))),
        file,
      });
    }

    const literalPathRegex = /(['"`])([^'"`]*\/api\/[^'"`\s)]+)\1/g;
    let literalMatch: RegExpExecArray | null;

    while ((literalMatch = literalPathRegex.exec(text)) !== null) {
      const rawPath = literalMatch[2];
      endpoints.push({
        method: 'ANY',
        path: normalizeTemplatePath(rawPath.slice(rawPath.indexOf('/api/'))),
        file,
      });
    }
  }

  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    const key = `${endpoint.method} ${endpoint.path} ${endpoint.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findIssues(): CheckIssue[] {
  const backendRoutes = extractBackendRoutes();
  const webEndpoints = extractWebEndpoints();
  const issues: CheckIssue[] = [];

  for (const endpoint of webEndpoints) {
    const matched = backendRoutes.some((route) => routeMatches(endpoint, route));
    if (!matched) {
      issues.push({
        file: toProjectPath(endpoint.file),
        message: `${endpoint.method} ${endpoint.path} has no matching backend route`,
      });
    }
  }

  return issues;
}

const issues = findIssues();
reportIssues('API contract smoke test', issues);
