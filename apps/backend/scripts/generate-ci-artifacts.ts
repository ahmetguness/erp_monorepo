import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listPermissionMatrix, type PermissionMatrixEntry } from '../src/services/permission-simulator.service';
import { joinRoutePath, normalizePath, readText, toProjectPath } from './lib/static-checks';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type ArtifactStatus = 'generated' | 'checked-by-quality-gate';

interface RouteManifestEntry {
  method: HttpMethod;
  path: string;
  file: string;
}

interface PermissionManifestEntry {
  id: string;
  method: PermissionMatrixEntry['method'];
  route: string;
  module: string;
  action: string;
  moduleGate: string | null;
  minPlan: PermissionMatrixEntry['minPlan'] | null;
  featureKey: string | null;
  webHref: string | null;
}

interface ArtifactEnvelope<T> {
  generatedAt: string;
  status: ArtifactStatus;
  data: T;
}

interface ContractDriftReport {
  gate: 'npm run test:contracts';
  status: ArtifactStatus;
  checkedAreas: readonly string[];
  note: string;
}

function extractRouteImports(indexText: string): Map<string, string> {
  const imports = new Map<string, string>();
  const importRegex = /import\s+\{\s*([A-Za-z0-9_,\s]+)\s*\}\s+from\s+'\.\/routes\/([^']+)'/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(indexText)) !== null) {
    const routeFile = match[2];
    for (const name of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
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

function extractRoutesFromText(text: string, routeVar: string, basePath: string, file: string): RouteManifestEntry[] {
  const routes: RouteManifestEntry[] = [];
  const routeRegex = new RegExp(`${routeVar}\\.(get|post|put|patch|delete)\\('([^']+)'`, 'g');
  let match: RegExpExecArray | null;

  while ((match = routeRegex.exec(text)) !== null) {
    routes.push({
      method: match[1].toUpperCase() as HttpMethod,
      path: joinRoutePath(basePath, match[2]),
      file,
    });
  }

  return routes;
}

function extractRouteManifest(): RouteManifestEntry[] {
  const backendSrc = resolve(process.cwd(), 'src');
  const indexPath = join(backendSrc, 'index.ts');
  const indexText = readText(indexPath);
  const imports = extractRouteImports(indexText);
  const mounts = extractMountedRoutes(indexText);
  const routes = [
    ...extractRoutesFromText(indexText, 'app', '', 'src/index.ts'),
    ...extractRoutesFromText(indexText, 'tenantApi', '/api', 'src/index.ts'),
  ];

  for (const [routeVar, basePath] of mounts) {
    const importPath = imports.get(routeVar);
    if (!importPath) continue;

    const file = join(backendSrc, 'routes', `${importPath}.ts`);
    if (!existsSync(file)) continue;
    routes.push(...extractRoutesFromText(readText(file), routeVar, basePath, toProjectPath(file)));
  }

  return routes.sort((left, right) => `${left.path} ${left.method}`.localeCompare(`${right.path} ${right.method}`));
}

function toPermissionManifestEntry(entry: PermissionMatrixEntry): PermissionManifestEntry {
  return {
    id: entry.id,
    method: entry.method,
    route: entry.route,
    module: entry.module,
    action: entry.action,
    moduleGate: entry.moduleGate ?? null,
    minPlan: entry.minPlan ?? null,
    featureKey: entry.featureKey ?? null,
    webHref: entry.webHref ?? null,
  };
}

function writeJson<T>(path: string, value: ArtifactEnvelope<T>): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main(): void {
  const outputDir = resolve(process.env.CI_ARTIFACT_DIR ?? 'ci-artifacts');
  mkdirSync(outputDir, { recursive: true });
  const generatedAt = new Date().toISOString();

  writeJson(join(outputDir, 'route-manifest.json'), {
    generatedAt,
    status: 'generated',
    data: extractRouteManifest(),
  });

  writeJson(join(outputDir, 'permission-manifest.json'), {
    generatedAt,
    status: 'generated',
    data: listPermissionMatrix().map(toPermissionManifestEntry),
  });

  const contractReport: ContractDriftReport = {
    gate: 'npm run test:contracts',
    status: 'checked-by-quality-gate',
    checkedAreas: [
      'backend route to web endpoint alignment',
      'priority runtime response fixtures',
      'web response validation coverage',
      'shared API and Zod contract drift',
      'external API key scope drift',
    ],
    note: 'Generate this artifact after npm run test:contracts so CI fails before uploading a stale success report.',
  };
  writeJson(join(outputDir, 'contract-drift-report.json'), {
    generatedAt,
    status: 'checked-by-quality-gate',
    data: contractReport,
  });

  console.log(`CI artifacts generated in ${outputDir}`);
}

main();
