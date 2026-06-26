import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { listPermissionMatrix, type PermissionMatrixEntry } from '../src/services/permission-simulator.service';
import { CheckIssue, joinRoutePath, normalizePath, readText, reportIssues, toProjectPath } from './lib/static-checks';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type PlanName = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

interface BackendRouteGate {
  method: HttpMethod;
  path: string;
  module: string;
  action: string;
  moduleGate?: string;
  minPlan?: PlanName;
  featureKey?: string;
  file: string;
}

interface WebNavGate {
  href: string;
  module?: string;
  plan?: PlanName;
  file: string;
}

interface RouteGates {
  moduleGate?: string;
  minPlan?: PlanName;
  featureKey?: string;
}

function toModuleKey(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

function parsePlan(value: string | undefined): PlanName | undefined {
  if (value === 'STARTER' || value === 'PROFESSIONAL' || value === 'ENTERPRISE') return value;
  return undefined;
}

function extractRouteImports(indexText: string): Map<string, string> {
  const imports = new Map<string, string>();
  const importRegex = /import\s+\{\s*([A-Za-z0-9_,\s]+)\s*\}\s+from\s+'\.\/routes\/([^']+)'/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(indexText)) !== null) {
    const names = match[1].split(',').map((name) => name.trim()).filter(Boolean);
    const routeFile = match[2];
    for (const name of names) imports.set(name, routeFile);
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

function extractGates(text: string): RouteGates {
  const accessMatch = /requireAccess\(ACCESS_POLICIES\.([A-Za-z0-9_]+)\)/.exec(text);
  if (accessMatch) {
    const policyKey = accessMatch[1] as keyof typeof ACCESS_POLICIES;
    const policy = ACCESS_POLICIES[policyKey];
    if (policy) {
      return {
        moduleGate: policy.module,
        minPlan: policy.minPlan as PlanName | undefined,
        featureKey: policy.featureKey,
      };
    }
  }

  const plan = parsePlan(/requirePlan\(Plan\.([A-Z_]+)\)/.exec(text)?.[1]);
  const featureKey = /requireFeature\(FeatureKey\.([A-Z_]+)\)/.exec(text)?.[1];
  const moduleGateRaw = /requireModule\(MODULE_KEYS\.([A-Z_]+)\)/.exec(text)?.[1];

  return {
    ...(moduleGateRaw && { moduleGate: toModuleKey(moduleGateRaw) }),
    ...(plan && { minPlan: plan }),
    ...(featureKey && { featureKey }),
  };
}

function mergeGates(parent: RouteGates, local: RouteGates): RouteGates {
  return {
    moduleGate: local.moduleGate ?? parent.moduleGate,
    minPlan: local.minPlan ?? parent.minPlan,
    featureKey: local.featureKey ?? parent.featureKey,
  };
}

function extractParentGates(routeText: string, routeVar: string): RouteGates {
  const useRegex = new RegExp(`${routeVar}\\.use\\('\\*',\\s*([^\\n;]+)`, 'g');
  let match: RegExpExecArray | null;
  let gates: RouteGates = {};

  while ((match = useRegex.exec(routeText)) !== null) {
    gates = mergeGates(gates, extractGates(match[1]));
  }

  return gates;
}

function extractRoutesFromFile(routeText: string, routeVar: string, basePath: string, file: string): BackendRouteGate[] {
  const parentGates = extractParentGates(routeText, routeVar);
  const routeRegex = new RegExp(`${routeVar}\\.(get|post|put|patch|delete)\\('([^']+)'([^\\n;]*)`, 'g');
  const routes: BackendRouteGate[] = [];
  let match: RegExpExecArray | null;

  while ((match = routeRegex.exec(routeText)) !== null) {
    const method = match[1].toUpperCase() as HttpMethod;
    const path = joinRoutePath(basePath, match[2]);
    const middlewareText = match[3];
    const permissionMatch = /requirePermission\('([^']+)',\s*'([A-Z]+)'\)/.exec(middlewareText);
    if (!permissionMatch) continue;

    const gates = mergeGates(parentGates, extractGates(middlewareText));
    routes.push({
      method,
      path,
      module: permissionMatch[1],
      action: permissionMatch[2],
      ...gates,
      file,
    });
  }

  return routes;
}

function extractBackendRouteManifest(): BackendRouteGate[] {
  const backendSrc = resolve(process.cwd(), 'src');
  const indexText = readText(join(backendSrc, 'index.ts'));
  const imports = extractRouteImports(indexText);
  const mounts = extractMountedRoutes(indexText);
  const routes: BackendRouteGate[] = [];

  for (const [routeVar, basePath] of mounts) {
    const importPath = imports.get(routeVar);
    if (!importPath) continue;
    const file = join(backendSrc, 'routes', `${importPath}.ts`);
    if (!existsSync(file)) continue;
    routes.push(...extractRoutesFromFile(readText(file), routeVar, basePath, toProjectPath(file)));
  }

  routes.push(...extractRoutesFromFile(indexText, 'tenantApi', '/api', 'src/index.ts'));
  return routes;
}

function extractWebNavManifest(): Map<string, WebNavGate> {
  const file = resolve(process.cwd(), '..', 'web', 'src', 'lib', 'nav-config.ts');
  const text = readText(file);
  const itemRegex = /\{[^{}]*href:\s*'([^']+)'[^{}]*\}/g;
  const manifest = new Map<string, WebNavGate>();
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(text)) !== null) {
    const body = match[0];
    const href = normalizePath(match[1]);
    const module = /module:\s*'([^']+)'/.exec(body)?.[1];
    let planRaw = /plan:\s*([A-Za-z0-9_']+)/.exec(body)?.[1];
    if (planRaw) planRaw = planRaw.replace(/'/g, '');
    let plan: PlanName | undefined = undefined;
    if (planRaw === 'PROFESSIONAL_PLAN' || planRaw === 'PROFESSIONAL') {
      plan = 'PROFESSIONAL';
    } else if (planRaw === 'ENTERPRISE_PLAN' || planRaw === 'ENTERPRISE') {
      plan = 'ENTERPRISE';
    } else if (planRaw === 'STARTER') {
      plan = 'STARTER';
    }
    const existing = manifest.get(href);
    manifest.set(href, {
      href,
      module: existing?.module ?? module,
      plan: existing?.plan ?? plan,
      file: toProjectPath(file),
    });
  }

  return manifest;
}

function findBackendRoute(routes: readonly BackendRouteGate[], entry: PermissionMatrixEntry): BackendRouteGate | undefined {
  return routes.find((route) => route.method === entry.method && route.path === normalizePath(entry.route));
}

function checkMatrixEntry(entry: PermissionMatrixEntry, backendRoutes: readonly BackendRouteGate[], webNav: ReadonlyMap<string, WebNavGate>): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const route = findBackendRoute(backendRoutes, entry);

  if (!route) {
    issues.push({ file: 'src/services/permission-simulator.service.ts', message: `${entry.id}: ${entry.method} ${entry.route} is missing from backend route manifest` });
    return issues;
  }

  if (route.module !== entry.module || route.action !== entry.action) {
    issues.push({ file: route.file, message: `${entry.id}: backend permission is ${route.module}:${route.action}, matrix says ${entry.module}:${entry.action}` });
  }
  if (route.moduleGate !== entry.moduleGate) {
    issues.push({ file: route.file, message: `${entry.id}: backend module gate is ${route.moduleGate ?? '-'}, matrix says ${entry.moduleGate ?? '-'}` });
  }
  if (route.minPlan !== entry.minPlan) {
    issues.push({ file: route.file, message: `${entry.id}: backend plan gate is ${route.minPlan ?? '-'}, matrix says ${entry.minPlan ?? '-'}` });
  }
  if (route.featureKey !== entry.featureKey) {
    issues.push({ file: route.file, message: `${entry.id}: backend feature gate is ${route.featureKey ?? '-'}, matrix says ${entry.featureKey ?? '-'}` });
  }

  if (entry.webHref) {
    const nav = webNav.get(normalizePath(entry.webHref));
    if (!nav) {
      issues.push({ file: '../web/src/lib/nav-config.ts', message: `${entry.id}: ${entry.webHref} is missing from web nav manifest` });
    } else {
      const expectedModule = entry.moduleGate;
      if (expectedModule && nav.module && nav.module !== expectedModule) {
        issues.push({ file: nav.file, message: `${entry.id}: web nav module is ${nav.module}, expected ${expectedModule}` });
      }
      if (entry.minPlan && nav.plan !== entry.minPlan) {
        issues.push({ file: nav.file, message: `${entry.id}: web nav plan is ${nav.plan ?? '-'}, expected ${entry.minPlan}` });
      }
    }
  }

  return issues;
}

function findIssues(): CheckIssue[] {
  const backendRoutes = extractBackendRouteManifest();
  const webNav = extractWebNavManifest();
  return listPermissionMatrix().flatMap((entry) => checkMatrixEntry(entry, backendRoutes, webNav));
}

reportIssues('Permission gating consistency', findIssues());
