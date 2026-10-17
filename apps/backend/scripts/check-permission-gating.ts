import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { ACCESS_POLICIES } from '@repo/types/plans';
import { listPermissionMatrix, type PermissionMatrixEntry } from '../src/services/permission-simulator.service';
import { CheckIssue, joinRoutePath, normalizePath, readText, reportIssues, toProjectPath, walkFiles } from './lib/static-checks';

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
  const useRegex = new RegExp(
    `${routeVar}\\.use\\(\\s*(["'])\\*\\1\\s*,([\\s\\S]*?)\\);`,
    'g',
  );
  let match: RegExpExecArray | null;
  let gates: RouteGates = {};

  while ((match = useRegex.exec(routeText)) !== null) {
    gates = mergeGates(gates, extractGates(match[2]));
  }

  return gates;
}

function extractRoutesFromFile(routeText: string, routeVar: string, basePath: string, file: string): BackendRouteGate[] {
  const parentGates = extractParentGates(routeText, routeVar);
  const routeRegex = new RegExp(
    `${routeVar}\\.(get|post|put|patch|delete)\\(\\s*(["'])([^"']+)\\2([\\s\\S]*?)\\);`,
    'g',
  );
  const routes: BackendRouteGate[] = [];
  let match: RegExpExecArray | null;

  while ((match = routeRegex.exec(routeText)) !== null) {
    const method = match[1].toUpperCase() as HttpMethod;
    const path = joinRoutePath(basePath, match[3]);
    const middlewareText = match[4];
    const permissionMatch = /requirePermission\(\s*["']([^"']+)["']\s*,\s*["']([A-Z]+)["']\s*\)/.exec(middlewareText);
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

  for (const moduleFile of walkFiles(join(backendSrc, 'modules'), ['.ts'])) {
    if (moduleFile.includes(`${join('modules', 'http-surfaces')}`)) continue;
    const moduleText = readText(moduleFile);
    const importedFiles = new Map<string, string>();
    const importRegex = /import\s+\{\s*([A-Za-z0-9_,\s]+)\s*\}\s+from\s*["']([^"']+)["']/g;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRegex.exec(moduleText)) !== null) {
      const sourcePath = importMatch[2];
      if (!sourcePath.startsWith('.')) continue;
      const absoluteSource = resolve(dirname(moduleFile), sourcePath.replace(/\.js$/, '.ts'));
      for (const name of importMatch[1].split(',').map((entry) => entry.trim()).filter(Boolean)) {
        importedFiles.set(name, absoluteSource);
      }
    }

    const mountRegex = /app\.route\(\s*["']([^"']+)["']\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
    let mountMatch: RegExpExecArray | null;
    while ((mountMatch = mountRegex.exec(moduleText)) !== null) {
      const routeVar = mountMatch[2];
      const routeFile = importedFiles.get(routeVar);
      if (!routeFile || !existsSync(routeFile)) continue;
      routes.push(...extractRoutesFromFile(
        readText(routeFile),
        routeVar,
        joinRoutePath('/api', mountMatch[1]),
        toProjectPath(routeFile),
      ));
    }
  }

  return routes;
}

function extractWebNavManifest(): Map<string, WebNavGate> {
  const absoluteFile = resolve(process.cwd(), '..', 'web', 'src', 'lib', 'nav-config.ts');
  const file = toProjectPath(absoluteFile);
  const source = ts.createSourceFile(
    absoluteFile,
    readText(absoluteFile),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const manifest = new Map<string, WebNavGate>();

  function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
    for (const member of object.properties) {
      if (!ts.isPropertyAssignment(member)) continue;
      const key = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
        ? member.name.text
        : undefined;
      if (key === name) return member.initializer;
    }
    return undefined;
  }

  function stringValue(expression: ts.Expression | undefined): string | undefined {
    return expression && ts.isStringLiteral(expression) ? expression.text : undefined;
  }

  function planValue(expression: ts.Expression | undefined): PlanName | undefined {
    const literal = stringValue(expression);
    if (literal === 'STARTER' || literal === 'PROFESSIONAL' || literal === 'ENTERPRISE') return literal;
    if (!expression || !ts.isIdentifier(expression)) return undefined;
    if (expression.text === 'PROFESSIONAL_PLAN') return 'PROFESSIONAL';
    if (expression.text === 'ENTERPRISE_PLAN') return 'ENTERPRISE';
    return undefined;
  }

  function visit(node: ts.Node): void {
    if (!ts.isObjectLiteralExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const hrefValue = stringValue(property(node, 'href'));
    if (!hrefValue) {
      ts.forEachChild(node, visit);
      return;
    }

    const href = normalizePath(hrefValue);
    const existing = manifest.get(href);
    manifest.set(href, {
      href,
      module: existing?.module ?? stringValue(property(node, 'module')),
      plan: existing?.plan ?? planValue(property(node, 'plan')),
      file,
    });
    ts.forEachChild(node, visit);
  }

  const navGroups = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'NAV_GROUPS');
  if (navGroups?.initializer) visit(navGroups.initializer);

  return manifest;
}

function findBackendRoute(routes: readonly BackendRouteGate[], entry: PermissionMatrixEntry): BackendRouteGate | undefined {
  return routes.find((route) => route.method === entry.method && route.path === normalizePath(entry.route));
}

function routeKey(method: HttpMethod, path: string): string {
  return `${method} ${normalizePath(path)}`;
}

function matrixEntryKey(entry: PermissionMatrixEntry): string {
  return routeKey(entry.method, entry.route);
}

function backendRouteKey(route: BackendRouteGate): string {
  return routeKey(route.method, route.path);
}

function accessPolicySignature(input: Pick<BackendRouteGate, 'moduleGate' | 'minPlan' | 'featureKey'>): string | null {
  if (!input.moduleGate && !input.minPlan && !input.featureKey) return null;
  return [
    `module=${input.moduleGate ?? '-'}`,
    `plan=${input.minPlan ?? '-'}`,
    `feature=${input.featureKey ?? '-'}`,
  ].join('|');
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
      if (entry.minPlan && entry.minPlan !== 'STARTER' && nav.plan !== entry.minPlan) {
        issues.push({ file: nav.file, message: `${entry.id}: web nav plan is ${nav.plan ?? '-'}, expected ${entry.minPlan}` });
      }
    }
  }

  return issues;
}

function checkMatrixRouteUniqueness(entries: readonly PermissionMatrixEntry[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const seen = new Map<string, PermissionMatrixEntry>();

  for (const entry of entries) {
    const key = matrixEntryKey(entry);
    const existing = seen.get(key);
    if (existing) {
      issues.push({
        file: 'src/services/permission-simulator.service.ts',
        message: `${entry.id}: duplicates ${key} already covered by ${existing.id}`,
      });
      continue;
    }
    seen.set(key, entry);
  }

  return issues;
}

function checkAccessPolicySignatureCoverage(
  backendRoutes: readonly BackendRouteGate[],
  entries: readonly PermissionMatrixEntry[],
): CheckIssue[] {
  const coveredSignatures = new Set(
    entries
      .map((entry) => accessPolicySignature(entry))
      .filter((signature): signature is string => Boolean(signature)),
  );
  const signatureExamples = new Map<string, BackendRouteGate>();
  const issues: CheckIssue[] = [];

  for (const route of backendRoutes) {
    const signature = accessPolicySignature(route);
    if (!signature || signatureExamples.has(signature)) continue;
    signatureExamples.set(signature, route);
  }

  for (const [signature, route] of signatureExamples) {
    if (coveredSignatures.has(signature)) continue;

    issues.push({
      file: route.file,
      message: `${backendRouteKey(route)}: backend access policy signature is not represented in permission matrix (${signature})`,
    });
  }

  return issues;
}

function findIssues(): CheckIssue[] {
  const backendRoutes = extractBackendRouteManifest();
  const webNav = extractWebNavManifest();
  const matrixEntries = listPermissionMatrix();
  return [
    ...checkMatrixRouteUniqueness(matrixEntries),
    ...matrixEntries.flatMap((entry) => checkMatrixEntry(entry, backendRoutes, webNav)),
    ...checkAccessPolicySignatureCoverage(backendRoutes, matrixEntries),
  ];
}

reportIssues('Permission gating consistency', findIssues());
