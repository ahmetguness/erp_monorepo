import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { CheckIssue, readText, reportIssues, toProjectPath, walkFiles } from './lib/static-checks';

type PrismaOperation =
  | 'findMany'
  | 'findFirst'
  | 'findUnique'
  | 'count'
  | 'aggregate'
  | 'groupBy'
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'upsert'
  | 'delete'
  | 'deleteMany';

interface TenantScopedModel {
  model: string;
  delegate: string;
}

interface PrismaCall {
  delegate: string;
  operation: PrismaOperation;
  needle: string;
  body: string;
  start: number;
}

const operations: readonly PrismaOperation[] = [
  'findMany',
  'findFirst',
  'findUnique',
  'count',
  'aggregate',
  'groupBy',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
];

const readOperations: ReadonlySet<PrismaOperation> = new Set(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy']);
const createOperations: ReadonlySet<PrismaOperation> = new Set(['create', 'createMany']);
const writeOperations: ReadonlySet<PrismaOperation> = new Set(['update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

const scannedRoots = [
  'src/controllers',
  'src/services',
  'src/domain-events',
  'src/middleware',
  'src/routes',
] as const;

const excludedFiles = new Set([
  'src/controllers/admin.controller.ts',
  'src/controllers/admin-security.controller.ts',
  'src/controllers/auth.controller.ts',
  'src/controllers/currency-rates.controller.ts',
  'src/controllers/demo.controller.ts',
  'src/controllers/invitation.controller.ts',
  'src/controllers/public-chat.controller.ts',
  'src/controllers/set-password.controller.ts',
  'src/controllers/trendyol-webhook.controller.ts',
  'src/services/demo.service.ts',
  'src/services/invitation.service.ts',
]);

const highRiskCoverage = [
  'src/controllers/activity.controller.ts',
  'src/controllers/search.controller.ts',
  'src/controllers/attachment.controller.ts',
  'src/controllers/mail.controller.ts',
  'src/controllers/saved-view.controller.ts',
  'src/controllers/notification.controller.ts',
  'src/controllers/marketplace.controller.ts',
  'src/routes/external.routes.ts',
  'src/services/activity.service.ts',
  'src/services/chat-context.service.ts',
  'src/services/document-center.service.ts',
  'src/services/mail-history.service.ts',
  'src/services/mail-template-library.service.ts',
  'src/services/mail.service.ts',
  'src/services/smart-notification.service.ts',
  'src/domain-events/listeners.ts',
] as const;

function toDelegateName(model: string): string {
  return `${model.charAt(0).toLocaleLowerCase('en-US')}${model.slice(1)}`;
}

function parseTenantScopedModels(schemaText: string): TenantScopedModel[] {
  const models: TenantScopedModel[] = [];
  const modelRegex = /model\s+([A-Za-z][A-Za-z0-9_]*)\s+\{([\s\S]*?)\n\}/g;

  for (const match of schemaText.matchAll(modelRegex)) {
    const model = match[1];
    const body = match[2];
    if (!model || !body) continue;
    if (!/^\s*tenantId\s+/m.test(body)) continue;
    models.push({ model, delegate: toDelegateName(model) });
  }

  return models;
}

function findCallBodies(text: string, needle: string): Array<{ body: string; start: number }> {
  const bodies: Array<{ body: string; start: number }> = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const start = text.indexOf(needle, searchIndex);
    if (start === -1) break;
    if (text[start + needle.length] !== '(') {
      searchIndex = start + needle.length;
      continue;
    }

    const openParen = start + needle.length;
    if (openParen === -1) break;

    let depth = 0;
    let end = openParen;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          bodies.push({ body: text.slice(openParen + 1, end), start });
          break;
        }
      }
    }

    searchIndex = end + 1;
  }

  return bodies;
}

function findPrismaCalls(text: string, models: readonly TenantScopedModel[]): PrismaCall[] {
  const calls: PrismaCall[] = [];

  for (const { delegate } of models) {
    for (const operation of operations) {
      for (const client of ['prisma', 'tx'] as const) {
        const needle = `${client}.${delegate}.${operation}`;
        for (const { body, start } of findCallBodies(text, needle)) {
          calls.push({ delegate, operation, needle, body, start });
        }
      }
    }
  }

  return calls.sort((left, right) => left.start - right.start);
}

function hasTenantScopedWhereVariableBefore(text: string, call: PrismaCall): boolean {
  if (!/\bwhere\b/.test(call.body)) return false;

  const contextStart = Math.max(0, call.start - 1600);
  const previousContext = text.slice(contextStart, call.start);
  const whereIndex = Math.max(previousContext.lastIndexOf('const where'), previousContext.lastIndexOf('let where'));
  if (whereIndex === -1) return false;

  return previousContext.slice(whereIndex).includes('tenantId');
}

function hasNearbyTenantGuardBefore(text: string, call: PrismaCall): boolean {
  const contextStart = Math.max(0, call.start - 2200);
  const previousContext = text.slice(contextStart, call.start);

  return (
    previousContext.includes(`prisma.${call.delegate}.findFirst`) && previousContext.includes('tenantId')
  ) || (
    previousContext.includes(`tx.${call.delegate}.findFirst`) && previousContext.includes('tenantId')
  ) || (
    previousContext.includes(`prisma.${call.delegate}.count`) && previousContext.includes('tenantId')
  ) || (
    previousContext.includes(`tx.${call.delegate}.count`) && previousContext.includes('tenantId')
  );
}

function hasTenantScopedDataVariableBefore(text: string, call: PrismaCall): boolean {
  if (!/\bdata\s*:\s*data\b/.test(call.body) && !/\{\s*data\s*\}/.test(call.body)) return false;

  const contextStart = Math.max(0, call.start - 1200);
  const previousContext = text.slice(contextStart, call.start);
  const dataIndex = Math.max(previousContext.lastIndexOf('const data'), previousContext.lastIndexOf('let data'));
  if (dataIndex === -1) return false;

  return previousContext.slice(dataIndex).includes('tenantId');
}

function hasTenantScopeInArguments(text: string, call: PrismaCall): boolean {
  return call.body.includes('tenantId') || hasTenantScopedWhereVariableBefore(text, call) || hasTenantScopedDataVariableBefore(text, call);
}

function targetsPlainId(body: string): boolean {
  return /where\s*:\s*\{\s*id\b/.test(body);
}

function checkPrismaCall(text: string, call: PrismaCall): string | null {
  if (hasTenantScopeInArguments(text, call)) return null;

  if (readOperations.has(call.operation)) {
    return `${call.needle} call is missing tenantId in query arguments`;
  }

  if (createOperations.has(call.operation)) {
    return `${call.needle} call is missing tenantId in created data`;
  }

  if (writeOperations.has(call.operation)) {
    if (targetsPlainId(call.body) && hasNearbyTenantGuardBefore(text, call)) return null;
    return `${call.needle} call is missing tenantId or a nearby tenant-scoped guard`;
  }

  return null;
}

function checkForbiddenIdentityPatterns(file: string, text: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const patterns = [
    /tenantId\s*[:=]\s*body\.tenantId/,
    /tenantId\s*[:=]\s*query\.tenantId/,
    /tenantId\s*[:=]\s*params\.tenantId/,
    /c\.req\.query\(['"]tenantId['"]\)/,
    /c\.req\.param\(['"]tenantId['"]\)/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      issues.push({ file, message: `client-provided tenantId pattern found: ${pattern.source}` });
    }
  }

  return issues;
}

function isExcluded(file: string): boolean {
  return excludedFiles.has(toProjectPath(file));
}

function listSourceFiles(): string[] {
  return scannedRoots.flatMap((root) => walkFiles(resolve(process.cwd(), root), ['.ts']));
}

function checkFile(file: string, models: readonly TenantScopedModel[]): CheckIssue[] {
  const projectPath = toProjectPath(file);
  if (isExcluded(file)) return [];

  const text = readText(file);
  const issues = checkForbiddenIdentityPatterns(projectPath, text);
  const calls = findPrismaCalls(text, models);

  if (projectPath.startsWith('src/controllers/') && calls.length > 0 && !text.includes('requireTenantId(c)')) {
    issues.push({ file: projectPath, message: 'controller with tenant-scoped Prisma calls does not read tenantId via requireTenantId(c)' });
  }

  for (const call of calls) {
    const message = checkPrismaCall(text, call);
    if (message) issues.push({ file: projectPath, message });
  }

  return issues;
}

function checkHighRiskCoverage(files: readonly string[]): CheckIssue[] {
  const fileSet = new Set(files.map(toProjectPath));
  const issues: CheckIssue[] = [];

  for (const path of highRiskCoverage) {
    const fullPath = resolve(process.cwd(), path);
    if (!fileSet.has(path) || !existsSync(fullPath)) {
      issues.push({ file: path, message: 'high-risk tenant isolation file is not covered by the scan' });
      continue;
    }

    readText(fullPath);
  }

  return issues;
}

function main(): void {
  const schema = readText(resolve(process.cwd(), 'prisma', 'schema.prisma'));
  const models = parseTenantScopedModels(schema);
  const files = listSourceFiles().filter((file) => basename(dirname(file)) !== 'node_modules');
  const issues = [
    ...checkHighRiskCoverage(files),
    ...files.flatMap((file) => checkFile(file, models)),
  ];

  reportIssues('Tenant isolation regression guard', issues);
}

main();
