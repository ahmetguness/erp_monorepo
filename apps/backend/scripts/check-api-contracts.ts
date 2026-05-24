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

type ResponseKind = 'single' | 'paginated' | 'error' | 'custom';

interface RuntimeContractSpec {
  name: string;
  method: HttpMethod;
  path: string;
  webServiceFile: string;
  responseKind: ResponseKind;
  fixture: unknown;
  requestFixture?: unknown;
  validateData?: (value: unknown) => string[];
  validateRequest?: (value: unknown) => string[];
}

function normalizeTemplatePath(path: string): string {
  return normalizePath(path.replace(/\$\{[^}]+\}/g, ':param'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string';
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'number' && Number.isFinite(record[key]);
}

function hasBoolean(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'boolean';
}

function hasArray(record: Record<string, unknown>, key: string): boolean {
  return Array.isArray(record[key]);
}

function validateSingleResponse(value: unknown): string[] {
  if (!isRecord(value)) return ['response must be an object'];
  if (!('data' in value)) return ['response must include data'];
  if ('meta' in value) return ['single response must not include meta'];
  if ('error' in value) return ['single response must not include error'];
  return [];
}

function validatePaginationMeta(value: unknown): string[] {
  if (!isRecord(value)) return ['meta must be an object'];
  const requiredNumberFields = ['total', 'page', 'pageSize', 'totalPages'];
  return requiredNumberFields
    .filter((field) => !hasNumber(value, field))
    .map((field) => `meta.${field} must be a number`);
}

function validatePaginatedResponse(value: unknown): string[] {
  if (!isRecord(value)) return ['response must be an object'];
  const issues: string[] = [];
  if (!Array.isArray(value.data)) issues.push('paginated response data must be an array');
  issues.push(...validatePaginationMeta(value.meta));
  if ('error' in value) issues.push('paginated response must not include error');
  return issues;
}

function validateErrorResponse(value: unknown): string[] {
  if (!isRecord(value)) return ['error response must be an object'];
  if (!isRecord(value.error)) return ['error response must include error object'];
  const issues: string[] = [];
  if (!hasString(value.error, 'code')) issues.push('error.code must be a string');
  if (!hasString(value.error, 'message')) issues.push('error.message must be a string');
  if ('fields' in value.error && !isRecord(value.error.fields)) issues.push('error.fields must be an object when present');
  return issues;
}

function validateByKind(kind: ResponseKind, fixture: unknown): string[] {
  switch (kind) {
    case 'single':
      return validateSingleResponse(fixture);
    case 'paginated':
      return validatePaginatedResponse(fixture);
    case 'error':
      return validateErrorResponse(fixture);
    case 'custom':
      return [];
  }
}

function validateObjectFields(value: unknown, required: readonly string[]): string[] {
  if (!isRecord(value)) return ['data must be an object'];
  return required
    .filter((field) => !(field in value))
    .map((field) => `data.${field} is required`);
}

function validateArrayItems(value: unknown, validateItem: (item: unknown) => string[]): string[] {
  if (!Array.isArray(value)) return ['data must be an array'];
  return value.flatMap((item, index) => validateItem(item).map((issue) => `data[${index}].${issue}`));
}

function validatePaginatedItems(fixture: unknown, validateItem: (item: unknown) => string[]): string[] {
  if (!isRecord(fixture) || !Array.isArray(fixture.data)) return [];
  return validateArrayItems(fixture.data, validateItem);
}

function dataOf(fixture: unknown): unknown {
  return isRecord(fixture) ? fixture.data : undefined;
}

function validateAuthMe(value: unknown): string[] {
  if (!isRecord(value)) return ['data must be an object'];
  const issues = validateObjectFields(value, ['user', 'tenant']);
  if (isRecord(value.user)) {
    if (!hasString(value.user, 'id')) issues.push('data.user.id must be a string');
    if (!hasString(value.user, 'email')) issues.push('data.user.email must be a string');
    if (!hasString(value.user, 'name')) issues.push('data.user.name must be a string');
    if (!hasBoolean(value.user, 'isActive')) issues.push('data.user.isActive must be a boolean');
  }
  if (isRecord(value.tenant)) {
    if (!hasString(value.tenant, 'id')) issues.push('data.tenant.id must be a string');
    if (!hasString(value.tenant, 'slug')) issues.push('data.tenant.slug must be a string');
    if (!hasString(value.tenant, 'plan')) issues.push('data.tenant.plan must be a string');
    if (!hasArray(value.tenant, 'modules')) issues.push('data.tenant.modules must be an array');
  }
  return issues;
}

function validateInvoiceItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  const issues = validateObjectFields(value, ['id', 'tenantId', 'contactId', 'number', 'type', 'status', 'date', 'currencyCode']);
  ['totalNet', 'totalTax', 'totalGross'].forEach((field) => {
    if (!hasNumber(value, field)) issues.push(`${field} must be a number`);
  });
  return issues;
}

function validatePaymentItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  const issues = validateObjectFields(value, ['id', 'tenantId', 'date', 'amount', 'method', 'status']);
  if (!hasNumber(value, 'amount')) issues.push('amount must be a number');
  return issues;
}

function validateInvoiceRequest(value: unknown): string[] {
  if (!isRecord(value)) return ['request must be an object'];
  const issues = validateObjectFields(value, ['contactId', 'type', 'date', 'lines']);
  if (!Array.isArray(value.lines) || value.lines.length === 0) issues.push('request.lines must be a non-empty array');
  return issues;
}

function validatePaymentRequest(value: unknown): string[] {
  if (!isRecord(value)) return ['request must be an object'];
  const issues = validateObjectFields(value, ['date', 'amount', 'method']);
  if (!hasNumber(value, 'amount')) issues.push('request.amount must be a number');
  return issues;
}

function validateContactItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  return validateObjectFields(value, ['id', 'tenantId', 'code', 'name', 'type', 'isActive']);
}

function validateStockMovementItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  const issues = validateObjectFields(value, ['id', 'tenantId', 'productId', 'type', 'quantity', 'date']);
  if (!hasNumber(value, 'quantity')) issues.push('quantity must be a number');
  return issues;
}

function validateTaskItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  return validateObjectFields(value, ['id', 'title', 'priority', 'type', 'dueAt', 'href', 'sourceId']);
}

function validateTaskRecord(value: unknown): string[] {
  if (!isRecord(value)) return ['data must be an object'];
  return validateObjectFields(value, ['id', 'tenantId', 'title', 'type', 'priority', 'status', 'createdAt', 'updatedAt']);
}

function validateTaskRequest(value: unknown): string[] {
  if (!isRecord(value)) return ['request must be an object'];
  return validateObjectFields(value, ['title']);
}

function validateWorkflowResponse(value: unknown): string[] {
  if (!isRecord(value)) return ['response must be an object'];
  const issues = validateArrayItems(value.data, validateTaskItem);
  if (!isRecord(value.meta)) issues.push('meta must be an object');
  if (isRecord(value.meta)) {
    if (!hasNumber(value.meta, 'total')) issues.push('meta.total must be a number');
    if (!isRecord(value.meta.counts)) issues.push('meta.counts must be an object');
  }
  return issues;
}

function validateMailItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  return validateObjectFields(value, ['id', 'tenantId', 'subject', 'to', 'status', 'createdAt']);
}

function validateMailSendRequest(value: unknown): string[] {
  if (!isRecord(value)) return ['request must be an object'];
  const issues = validateObjectFields(value, ['to', 'subject', 'html']);
  if (!Array.isArray(value.to) || value.to.length === 0) issues.push('request.to must be a non-empty array');
  return issues;
}

function validateAttachmentItem(value: unknown): string[] {
  if (!isRecord(value)) return ['must be an object'];
  return validateObjectFields(value, ['id', 'tenantId', 'fileName', 'mimeType', 'size', 'entityType', 'entityId']);
}

function validateActivityResponse(value: unknown): string[] {
  if (!isRecord(value)) return ['response must be an object'];
  const issues: string[] = [];
  if (!Array.isArray(value.data)) issues.push('data must be an array');
  if (!isRecord(value.meta)) issues.push('meta must be an object');
  if (isRecord(value.meta)) {
    if (!hasNumber(value.meta, 'total')) issues.push('meta.total must be a number');
    if (!hasBoolean(value.meta, 'hasMore')) issues.push('meta.hasMore must be a boolean');
  }
  return issues;
}

function validateSearchResponse(value: unknown): string[] {
  if (!isRecord(value)) return ['response must be an object'];
  if (!Array.isArray(value.results)) return ['results must be an array'];
  return value.results.flatMap((item, index) => {
    if (!isRecord(item)) return [`results[${index}] must be an object`];
    return validateObjectFields(item, ['id', 'type', 'title', 'href']).map((issue) => `results[${index}].${issue}`);
  });
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

const runtimeContracts: readonly RuntimeContractSpec[] = [
  {
    name: 'auth/me',
    method: 'GET',
    path: '/api/auth/me',
    webServiceFile: 'auth.service.ts',
    responseKind: 'single',
    fixture: {
      data: {
        user: {
          id: 'user_1',
          email: 'owner@example.com',
          name: 'Owner User',
          phone: null,
          isActive: true,
          tenantMembership: { isOwner: true, roleId: null, role: null },
        },
        tenant: {
          id: 'tenant_1',
          slug: 'demo',
          companyName: 'Demo A.S.',
          plan: 'PROFESSIONAL',
          status: 'ACTIVE',
          modules: ['contacts', 'invoicing'],
          trialEndsAt: null,
        },
        preferences: null,
      },
    },
    validateData: (fixture) => validateAuthMe(dataOf(fixture)),
  },
  {
    name: 'invoices list',
    method: 'GET',
    path: '/api/invoices',
    webServiceFile: 'sales.service.ts',
    responseKind: 'paginated',
    fixture: {
      data: [{
        id: 'invoice_1',
        tenantId: 'tenant_1',
        contactId: 'contact_1',
        salesOrderId: null,
        purchaseOrderId: null,
        type: 'SALES',
        status: 'SENT',
        number: 'INV-001',
        date: '2026-05-24',
        dueDate: '2026-06-24',
        currencyCode: 'TRY',
        totalNet: 100,
        totalTax: 20,
        totalGross: 120,
        notes: null,
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    requestFixture: { page: 1, limit: 20, status: 'SENT' },
    validateData: (fixture) => validatePaginatedItems(fixture, validateInvoiceItem),
  },
  {
    name: 'invoice create',
    method: 'POST',
    path: '/api/invoices',
    webServiceFile: 'sales.service.ts',
    responseKind: 'single',
    requestFixture: {
      contactId: 'contact_1',
      type: 'SALES',
      date: '2026-05-24',
      dueDate: '2026-06-24',
      lines: [{ description: 'Hizmet', quantity: 1, unitPrice: 100, discount: 0 }],
    },
    fixture: {
      data: {
        id: 'invoice_1',
        tenantId: 'tenant_1',
        contactId: 'contact_1',
        salesOrderId: null,
        purchaseOrderId: null,
        type: 'SALES',
        status: 'DRAFT',
        number: 'INV-001',
        date: '2026-05-24',
        dueDate: '2026-06-24',
        currencyCode: 'TRY',
        totalNet: 100,
        totalTax: 20,
        totalGross: 120,
        notes: null,
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      },
    },
    validateRequest: validateInvoiceRequest,
    validateData: (fixture) => validateInvoiceItem(dataOf(fixture)),
  },
  {
    name: 'payments list',
    method: 'GET',
    path: '/api/payments',
    webServiceFile: 'accounting.service.ts',
    responseKind: 'paginated',
    fixture: {
      data: [{
        id: 'payment_1',
        tenantId: 'tenant_1',
        contactId: 'contact_1',
        bankAccountId: null,
        cashAccountId: 'cash_1',
        date: '2026-05-24',
        amount: 120,
        method: 'CASH',
        reference: null,
        status: 'COMPLETED',
        notes: null,
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    requestFixture: { page: 1, limit: 20, status: 'COMPLETED' },
    validateData: (fixture) => validatePaginatedItems(fixture, validatePaymentItem),
  },
  {
    name: 'payment create',
    method: 'POST',
    path: '/api/payments',
    webServiceFile: 'accounting.service.ts',
    responseKind: 'single',
    requestFixture: {
      contactId: 'contact_1',
      cashAccountId: 'cash_1',
      date: '2026-05-24',
      amount: 120,
      method: 'CASH',
      direction: 'RECEIVE',
    },
    fixture: {
      data: {
        id: 'payment_1',
        tenantId: 'tenant_1',
        contactId: 'contact_1',
        bankAccountId: null,
        cashAccountId: 'cash_1',
        date: '2026-05-24',
        amount: 120,
        method: 'CASH',
        reference: null,
        status: 'COMPLETED',
        notes: null,
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      },
    },
    validateRequest: validatePaymentRequest,
    validateData: (fixture) => validatePaymentItem(dataOf(fixture)),
  },
  {
    name: 'stock movements list',
    method: 'GET',
    path: '/api/stock/movements',
    webServiceFile: 'stock.service.ts',
    responseKind: 'paginated',
    fixture: {
      data: [{
        id: 'movement_1',
        tenantId: 'tenant_1',
        productId: 'product_1',
        warehouseId: 'warehouse_1',
        type: 'IN',
        quantity: 5,
        unitCost: 10,
        referenceType: null,
        referenceId: null,
        notes: null,
        date: '2026-05-24T10:00:00.000Z',
        createdAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    requestFixture: { page: 1, limit: 20 },
    validateData: (fixture) => validatePaginatedItems(fixture, validateStockMovementItem),
  },
  {
    name: 'contacts list',
    method: 'GET',
    path: '/api/contacts',
    webServiceFile: 'contact.service.ts',
    responseKind: 'paginated',
    fixture: {
      data: [{
        id: 'contact_1',
        tenantId: 'tenant_1',
        code: 'C-001',
        name: 'Acme Ltd.',
        type: 'CUSTOMER',
        taxNumber: null,
        email: 'billing@example.com',
        phone: null,
        isActive: true,
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    requestFixture: { page: 1, limit: 20, search: 'Acme' },
    validateData: (fixture) => validatePaginatedItems(fixture, validateContactItem),
  },
  {
    name: 'attachments library',
    method: 'GET',
    path: '/api/attachments/library',
    webServiceFile: 'attachment.service.ts',
    responseKind: 'paginated',
    fixture: {
      data: [{
        id: 'attachment_1',
        tenantId: 'tenant_1',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        entityType: 'CONTACT',
        entityId: 'contact_1',
        createdAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    requestFixture: { page: 1, limit: 20, search: 'contract' },
    validateData: (fixture) => validatePaginatedItems(fixture, validateAttachmentItem),
  },
  {
    name: 'activity feed',
    method: 'GET',
    path: '/api/activity',
    webServiceFile: 'activity.service.ts',
    responseKind: 'custom',
    fixture: {
      data: [{
        id: 'activity_1',
        source: 'audit',
        sourceId: 'audit_1',
        type: 'CREATE',
        title: 'Kayit olusturuldu',
        description: 'Demo kaydi olusturuldu.',
        tone: 'success',
        createdAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, hasMore: false },
    },
    requestFixture: { entityType: 'CONTACT', entityId: 'contact_1', limit: 20 },
    validateData: validateActivityResponse,
  },
  {
    name: 'global search',
    method: 'GET',
    path: '/api/search',
    webServiceFile: 'search.service.ts',
    responseKind: 'custom',
    fixture: {
      results: [{
        id: 'contact_1',
        type: 'contact',
        title: 'Acme Ltd.',
        subtitle: 'Cari',
        href: '/dashboard/contacts/contact_1',
      }],
    },
    requestFixture: { q: 'acme', limit: 10 },
    validateData: validateSearchResponse,
  },
  {
    name: 'mail list',
    method: 'GET',
    path: '/api/mail',
    webServiceFile: 'mail.service.ts',
    responseKind: 'paginated',
    fixture: {
      data: [{
        id: 'mail_1',
        tenantId: 'tenant_1',
        subject: 'Odeme hatirlatma',
        to: ['billing@example.com'],
        cc: [],
        bcc: [],
        status: 'SENT',
        createdAt: '2026-05-24T10:00:00.000Z',
      }],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    requestFixture: { page: 1, limit: 20 },
    validateData: (fixture) => validatePaginatedItems(fixture, validateMailItem),
  },
  {
    name: 'mail send',
    method: 'POST',
    path: '/api/mail/send',
    webServiceFile: 'mail.service.ts',
    responseKind: 'single',
    requestFixture: {
      to: ['billing@example.com'],
      subject: 'Odeme hatirlatma',
      html: '<p>Merhaba</p>',
    },
    fixture: { data: { success: true, messageId: 'mail_provider_1' } },
    validateRequest: validateMailSendRequest,
  },
  {
    name: 'tasks list',
    method: 'GET',
    path: '/api/tasks',
    webServiceFile: 'task.service.ts',
    responseKind: 'custom',
    fixture: {
      data: [{
        id: 'task_1',
        title: 'Faturayi takip et',
        detail: null,
        status: 'TODO',
        priority: 'HIGH',
        type: 'COLLECTION',
        dueAt: '2026-05-25T10:00:00.000Z',
        href: '/dashboard/invoices/invoice_1',
        sourceId: 'invoice_1',
      }],
      meta: {
        total: 1,
        counts: { APPROVAL: 0, COLLECTION: 1, SERVICE: 0, NOTIFICATION: 0, CHECK: 0, AUTOMATION: 0, STOCK: 0, FISCAL: 0, GENERAL: 0 },
      },
    },
    validateData: validateWorkflowResponse,
  },
  {
    name: 'task create',
    method: 'POST',
    path: '/api/tasks',
    webServiceFile: 'task.service.ts',
    responseKind: 'single',
    requestFixture: {
      title: 'Faturayi takip et',
      type: 'COLLECTION',
      priority: 'HIGH',
      entityType: 'INVOICE',
      entityId: 'invoice_1',
    },
    fixture: {
      data: {
        id: 'task_1',
        tenantId: 'tenant_1',
        title: 'Faturayi takip et',
        detail: null,
        type: 'COLLECTION',
        priority: 'HIGH',
        status: 'TODO',
        module: 'invoicing',
        entityType: 'INVOICE',
        entityId: 'invoice_1',
        href: '/dashboard/invoices/invoice_1',
        source: 'manual',
        assignedToId: null,
        createdById: 'user_1',
        dueAt: null,
        completedAt: null,
        createdAt: '2026-05-24T10:00:00.000Z',
        updatedAt: '2026-05-24T10:00:00.000Z',
      },
    },
    validateRequest: validateTaskRequest,
    validateData: (fixture) => validateTaskRecord(dataOf(fixture)),
  },
  {
    name: 'standard error',
    method: 'GET',
    path: '/api/invoices/:id',
    webServiceFile: 'sales.service.ts',
    responseKind: 'error',
    fixture: { error: { code: 'NOT_FOUND', message: 'Fatura bulunamadi.' } },
  },
];

function servicePathFor(webServiceFile: string): string {
  return resolve(process.cwd(), '..', 'web', 'src', 'services', webServiceFile);
}

function validateRuntimeContracts(backendRoutes: readonly BackendRoute[]): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const contract of runtimeContracts) {
    const routeExists = backendRoutes.some((route) => routeMatches({
      method: contract.method,
      path: contract.path,
      file: contract.webServiceFile,
    }, route));
    if (!routeExists) {
      issues.push({
        file: 'scripts/check-api-contracts.ts',
        message: `${contract.name}: ${contract.method} ${contract.path} has no matching backend route`,
      });
    }

    const servicePath = servicePathFor(contract.webServiceFile);
    if (!existsSync(servicePath)) {
      issues.push({ file: `../web/src/services/${contract.webServiceFile}`, message: `${contract.name}: web service file is missing` });
    } else {
      const serviceText = readText(servicePath);
      if (!serviceText.includes(contract.path.replace('/:id', ''))) {
        issues.push({ file: toProjectPath(servicePath), message: `${contract.name}: web service does not reference ${contract.path}` });
      }
      if (!serviceText.includes('safeParse(')) {
        issues.push({ file: toProjectPath(servicePath), message: `${contract.name}: web service does not use safeParse` });
      }
    }

    const shapeIssues = [
      ...validateByKind(contract.responseKind, contract.fixture),
      ...(contract.validateData ? contract.validateData(contract.fixture) : []),
      ...(contract.requestFixture && contract.validateRequest ? contract.validateRequest(contract.requestFixture) : []),
    ];

    for (const issue of shapeIssues) {
      issues.push({ file: 'scripts/check-api-contracts.ts', message: `${contract.name}: ${issue}` });
    }
  }

  return issues;
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

  issues.push(...validateRuntimeContracts(backendRoutes));

  return issues;
}

const issues = findIssues();
reportIssues('API contract smoke test', issues);
