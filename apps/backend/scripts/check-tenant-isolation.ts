import { resolve } from 'node:path';
import { CheckIssue, readText, reportIssues, toProjectPath } from './lib/static-checks';

interface ControllerRule {
  file: string;
  delegates: readonly string[];
}

const rules: readonly ControllerRule[] = [
  { file: 'product.controller.ts', delegates: ['product'] },
  { file: 'contact.controller.ts', delegates: ['contact', 'accountEntry', 'invoice'] },
  { file: 'invoice.controller.ts', delegates: ['invoice', 'invoiceLine', 'invoiceHistory', 'contact', 'product'] },
  { file: 'stock.controller.ts', delegates: ['stockLevel', 'stockMovement', 'stockCount', 'stockCountItem', 'product', 'warehouse', 'location'] },
  { file: 'payment.controller.ts', delegates: ['payment', 'paymentAllocation', 'contact', 'invoice', 'bankAccount', 'cashAccount'] },
  { file: 'role.controller.ts', delegates: ['role', 'tenantUser'] },
  { file: 'attachment.controller.ts', delegates: ['attachment', 'invoice', 'product', 'category', 'contact', 'employee', 'customerAsset', 'serviceRequest', 'purchaseOrder', 'salesOrder', 'workOrder', 'deliveryNote'] },
];

const readOperations = ['findMany', 'findFirst', 'count'] as const;
const directIdOperations = ['findUnique', 'update', 'delete'] as const;

function findCallBodies(text: string, needle: string): string[] {
  const bodies: string[] = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const start = text.indexOf(needle, searchIndex);
    if (start === -1) break;

    const openParen = text.indexOf('(', start + needle.length);
    if (openParen === -1) break;

    let depth = 0;
    let end = openParen;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          bodies.push(text.slice(openParen + 1, end));
          break;
        }
      }
    }

    searchIndex = end + 1;
  }

  return bodies;
}

function hasTenantGuardBefore(text: string, needle: string, body: string, delegate: string): boolean {
  const callStart = text.indexOf(`${needle}(${body}`);
  if (callStart <= 0) return false;

  const contextStart = Math.max(0, callStart - 1500);
  const previousContext = text.slice(contextStart, callStart);
  return previousContext.includes(`prisma.${delegate}.findFirst`) && previousContext.includes('tenantId');
}

function hasTenantScopedWhereVariableBefore(text: string, needle: string, body: string): boolean {
  if (!/\bwhere\b/.test(body)) return false;

  const callStart = text.indexOf(`${needle}(${body}`);
  if (callStart <= 0) return false;

  const contextStart = Math.max(0, callStart - 1200);
  const previousContext = text.slice(contextStart, callStart);
  const whereIndex = Math.max(previousContext.lastIndexOf('const where'), previousContext.lastIndexOf('let where'));
  if (whereIndex === -1) return false;

  const whereContext = previousContext.slice(whereIndex);
  return whereContext.includes('tenantId');
}

function checkController(rule: ControllerRule): CheckIssue[] {
  const file = resolve(process.cwd(), 'src', 'controllers', rule.file);
  const text = readText(file);
  const issues: CheckIssue[] = [];

  if (!text.includes('requireTenantId(c)')) {
    issues.push({ file: toProjectPath(file), message: 'controller does not read tenantId via requireTenantId(c)' });
  }

  const forbiddenIdentityPatterns = [
    /tenantId\s*[:=]\s*body\.tenantId/,
    /tenantId\s*[:=]\s*query\.tenantId/,
    /c\.req\.query\(['"]tenantId['"]\)/,
  ];
  for (const pattern of forbiddenIdentityPatterns) {
    if (pattern.test(text)) {
      issues.push({ file: toProjectPath(file), message: `client-provided tenantId pattern found: ${pattern.source}` });
    }
  }

  for (const delegate of rule.delegates) {
    for (const operation of readOperations) {
      const needle = `prisma.${delegate}.${operation}`;
      for (const body of findCallBodies(text, needle)) {
        if (!body.includes('tenantId') && !hasTenantScopedWhereVariableBefore(text, needle, body)) {
          issues.push({ file: toProjectPath(file), message: `${needle} call is missing tenantId in query arguments` });
        }
      }
    }

    for (const operation of directIdOperations) {
      const needle = `prisma.${delegate}.${operation}`;
      for (const body of findCallBodies(text, needle)) {
        const targetsPlainId = /where\s*:\s*\{\s*id\b/.test(body);
        if (!targetsPlainId || body.includes('tenantId')) continue;

        if (!hasTenantGuardBefore(text, needle, body, delegate)) {
          issues.push({ file: toProjectPath(file), message: `${needle} by id has no nearby tenant-scoped guard` });
        }
      }
    }
  }

  return issues;
}

const issues = rules.flatMap(checkController);
reportIssues('Tenant isolation regression guard', issues);
