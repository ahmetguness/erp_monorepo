export type ExternalHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ExternalApiExample {
  request?: unknown;
  response: unknown;
}

export interface ExternalApiEndpoint {
  method: ExternalHttpMethod;
  path: string;
  summary: string;
  description: string;
  scope: string;
  group: string;
  sandboxSupported: boolean;
  queryExample?: string;
  requestExample?: unknown;
  responseExample: unknown;
}

export interface ExternalScopeManifestItem {
  scope: string;
  label: string;
  description: string;
  endpoints: Array<Pick<ExternalApiEndpoint, 'method' | 'path' | 'summary' | 'sandboxSupported'>>;
}

export interface ExternalApiManifest {
  version: string;
  basePath: string;
  auth: {
    header: 'x-api-key';
    sandboxHeader: 'x-sandbox-mode';
  };
  rateLimit: {
    perMinute: number;
    scope: 'apiKey';
  };
  scopes: ExternalScopeManifestItem[];
  endpoints: ExternalApiEndpoint[];
}

interface OpenApiSchemaRef {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  properties?: Record<string, OpenApiSchemaRef>;
  items?: OpenApiSchemaRef;
  additionalProperties?: boolean;
  example?: unknown;
}

interface OpenApiResponse {
  description: string;
  content?: {
    'application/json': {
      schema: OpenApiSchemaRef;
      examples?: Record<string, { value: unknown }>;
    };
  };
}

interface OpenApiOperation {
  summary: string;
  description: string;
  tags: string[];
  security: Array<{ ApiKeyAuth: string[] }>;
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'header';
    required?: boolean;
    schema: OpenApiSchemaRef;
    description?: string;
  }>;
  requestBody?: {
    required: boolean;
    content: {
      'application/json': {
        schema: OpenApiSchemaRef;
        examples?: Record<string, { value: unknown }>;
      };
    };
  };
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey';
        in: 'header';
        name: 'x-api-key';
      };
    };
    schemas: Record<string, OpenApiSchemaRef>;
  };
  paths: Record<string, Partial<Record<ExternalHttpMethodLower, OpenApiOperation>>>;
}

type ExternalHttpMethodLower = 'get' | 'post' | 'patch' | 'delete';

const EXTERNAL_API_VERSION = '2026-06-22';
const DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE = 120;

export const EXTERNAL_API_ENDPOINTS: readonly ExternalApiEndpoint[] = [
  {
    method: 'GET',
    path: '/api/external/products',
    summary: 'List products',
    description: 'Returns paginated products for the authenticated tenant.',
    scope: 'products:read',
    group: 'Products',
    sandboxSupported: true,
    queryExample: '?page=1&limit=20',
    responseExample: { data: [{ id: 'prd_123', code: 'PRD-001', name: 'Sample Product' }], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } },
  },
  {
    method: 'GET',
    path: '/api/external/products/{id}',
    summary: 'Get product',
    description: 'Returns a single product by ID.',
    scope: 'products:read',
    group: 'Products',
    sandboxSupported: true,
    responseExample: { data: { id: 'prd_123', code: 'PRD-001', name: 'Sample Product', isActive: true } },
  },
  {
    method: 'POST',
    path: '/api/external/products',
    summary: 'Create product',
    description: 'Creates a product. Related IDs are validated inside the tenant boundary.',
    scope: 'products:write',
    group: 'Products',
    sandboxSupported: true,
    requestExample: { code: 'PRD-001', name: 'Sample Product', unitId: 'unit_123', salesPrice: 100 },
    responseExample: { data: { id: 'prd_123', code: 'PRD-001', name: 'Sample Product', createdAt: '2026-06-22T00:00:00.000Z' } },
  },
  {
    method: 'PATCH',
    path: '/api/external/products/{id}',
    summary: 'Update product',
    description: 'Updates mutable product fields.',
    scope: 'products:write',
    group: 'Products',
    sandboxSupported: true,
    requestExample: { name: 'Updated Product', salesPrice: 125 },
    responseExample: { data: { id: 'prd_123', code: 'PRD-001', name: 'Updated Product', updatedAt: '2026-06-22T00:00:00.000Z' } },
  },
  {
    method: 'DELETE',
    path: '/api/external/products/{id}',
    summary: 'Delete product',
    description: 'Soft deletes a product.',
    scope: 'products:delete',
    group: 'Products',
    sandboxSupported: true,
    responseExample: { data: { success: true } },
  },
  {
    method: 'GET',
    path: '/api/external/contacts',
    summary: 'List contacts',
    description: 'Returns paginated contacts.',
    scope: 'contacts:read',
    group: 'Contacts',
    sandboxSupported: true,
    queryExample: '?page=1&limit=20',
    responseExample: { data: [{ id: 'cnt_123', code: 'C-001', name: 'ABC Ltd.' }], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } },
  },
  {
    method: 'GET',
    path: '/api/external/contacts/{id}',
    summary: 'Get contact',
    description: 'Returns a single contact by ID.',
    scope: 'contacts:read',
    group: 'Contacts',
    sandboxSupported: true,
    responseExample: { data: { id: 'cnt_123', code: 'C-001', name: 'ABC Ltd.', type: 'CUSTOMER' } },
  },
  {
    method: 'POST',
    path: '/api/external/contacts',
    summary: 'Create contact',
    description: 'Creates a customer, supplier, or both contact.',
    scope: 'contacts:write',
    group: 'Contacts',
    sandboxSupported: true,
    requestExample: { type: 'CUSTOMER', name: 'ABC Ltd.', email: 'finance@example.com' },
    responseExample: { data: { id: 'cnt_123', type: 'CUSTOMER', name: 'ABC Ltd.', createdAt: '2026-06-22T00:00:00.000Z' } },
  },
  {
    method: 'PATCH',
    path: '/api/external/contacts/{id}',
    summary: 'Update contact',
    description: 'Updates mutable contact fields.',
    scope: 'contacts:write',
    group: 'Contacts',
    sandboxSupported: true,
    requestExample: { email: 'new@example.com', paymentTermDays: 30 },
    responseExample: { data: { id: 'cnt_123', code: 'C-001', name: 'ABC Ltd.', updatedAt: '2026-06-22T00:00:00.000Z' } },
  },
  {
    method: 'DELETE',
    path: '/api/external/contacts/{id}',
    summary: 'Delete contact',
    description: 'Soft deletes a contact.',
    scope: 'contacts:delete',
    group: 'Contacts',
    sandboxSupported: true,
    responseExample: { data: { success: true } },
  },
  {
    method: 'GET',
    path: '/api/external/invoices',
    summary: 'List invoices',
    description: 'Returns paginated invoices.',
    scope: 'invoices:read',
    group: 'Invoices',
    sandboxSupported: true,
    queryExample: '?page=1&limit=20',
    responseExample: { data: [{ id: 'inv_123', number: 'INV-001', status: 'DRAFT', totalGross: 120 }], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } },
  },
  {
    method: 'GET',
    path: '/api/external/invoices/{id}',
    summary: 'Get invoice',
    description: 'Returns invoice detail with lines.',
    scope: 'invoices:read',
    group: 'Invoices',
    sandboxSupported: true,
    responseExample: { data: { id: 'inv_123', number: 'INV-001', lines: [] } },
  },
  {
    method: 'POST',
    path: '/api/external/invoices',
    summary: 'Create invoice',
    description: 'Creates an invoice with lines.',
    scope: 'invoices:write',
    group: 'Invoices',
    sandboxSupported: true,
    requestExample: { contactId: 'cnt_123', type: 'SALES', number: 'INV-001', date: '2026-06-22', lines: [{ description: 'Service', quantity: 1, unitPrice: 100 }] },
    responseExample: { data: { id: 'inv_123', number: 'INV-001', status: 'DRAFT', totalGross: 100 } },
  },
  {
    method: 'POST',
    path: '/api/external/invoices/{id}/cancel',
    summary: 'Cancel invoice',
    description: 'Cancels an invoice.',
    scope: 'invoices:delete',
    group: 'Invoices',
    sandboxSupported: true,
    responseExample: { data: { id: 'inv_123', number: 'INV-001', status: 'CANCELLED' } },
  },
  {
    method: 'GET',
    path: '/api/external/stock-levels',
    summary: 'List stock levels',
    description: 'Returns paginated stock levels by product and warehouse.',
    scope: 'inventory:read',
    group: 'Inventory',
    sandboxSupported: true,
    queryExample: '?page=1&limit=50',
    responseExample: { data: [{ id: 'stk_123', quantity: 25, product: { id: 'prd_123', code: 'PRD-001' } }], meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 } },
  },
  {
    method: 'POST',
    path: '/api/external/stock-movements',
    summary: 'Create stock movement',
    description: 'Creates stock movement and updates stock levels.',
    scope: 'inventory:write',
    group: 'Inventory',
    sandboxSupported: true,
    requestExample: { productId: 'prd_123', type: 'IN', quantity: 5, toWarehouseId: 'wh_123' },
    responseExample: { data: { id: 'mov_123', type: 'IN', quantity: 5, createdAt: '2026-06-22T00:00:00.000Z' } },
  },
  {
    method: 'GET',
    path: '/api/external/sales-orders',
    summary: 'List sales orders',
    description: 'Returns paginated sales orders.',
    scope: 'orders:read',
    group: 'Orders',
    sandboxSupported: true,
    queryExample: '?page=1&limit=20',
    responseExample: { data: [{ id: 'so_123', number: 'SO-001', status: 'DRAFT' }], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } },
  },
  {
    method: 'POST',
    path: '/api/external/sales-orders',
    summary: 'Create sales order',
    description: 'Creates a sales order with items.',
    scope: 'orders:write',
    group: 'Orders',
    sandboxSupported: true,
    requestExample: { contactId: 'cnt_123', number: 'SO-001', date: '2026-06-22', items: [{ productId: 'prd_123', description: 'Product', quantity: 1, unitPrice: 100 }] },
    responseExample: { data: { id: 'so_123', number: 'SO-001', status: 'DRAFT', totalGross: 100 } },
  },
] as const;

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  'products:read': { label: 'Products read', description: 'Read product lists and product details.' },
  'products:write': { label: 'Products write', description: 'Create and update products.' },
  'products:delete': { label: 'Products delete', description: 'Soft delete products.' },
  'contacts:read': { label: 'Contacts read', description: 'Read contacts.' },
  'contacts:write': { label: 'Contacts write', description: 'Create and update contacts.' },
  'contacts:delete': { label: 'Contacts delete', description: 'Soft delete contacts.' },
  'invoices:read': { label: 'Invoices read', description: 'Read invoice lists and details.' },
  'invoices:write': { label: 'Invoices write', description: 'Create invoices.' },
  'invoices:delete': { label: 'Invoices cancel', description: 'Cancel invoices.' },
  'inventory:read': { label: 'Inventory read', description: 'Read stock levels.' },
  'inventory:write': { label: 'Inventory write', description: 'Create stock movements.' },
  'orders:read': { label: 'Orders read', description: 'Read sales orders.' },
  'orders:write': { label: 'Orders write', description: 'Create sales orders.' },
};

export function getExternalApiRateLimitPerMinute(): number {
  const parsed = Number.parseInt(process.env.EXTERNAL_API_KEY_RATE_LIMIT_PER_MINUTE ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_API_KEY_RATE_LIMIT_PER_MINUTE;
}

export function getExternalApiManifest(): ExternalApiManifest {
  const scopes = Object.entries(SCOPE_LABELS).map(([scope, meta]) => ({
    scope,
    label: meta.label,
    description: meta.description,
    endpoints: EXTERNAL_API_ENDPOINTS
      .filter((endpoint) => endpoint.scope === scope)
      .map((endpoint) => ({
        method: endpoint.method,
        path: endpoint.path,
        summary: endpoint.summary,
        sandboxSupported: endpoint.sandboxSupported,
      })),
  }));

  return {
    version: EXTERNAL_API_VERSION,
    basePath: '/api/external',
    auth: { header: 'x-api-key', sandboxHeader: 'x-sandbox-mode' },
    rateLimit: { perMinute: getExternalApiRateLimitPerMinute(), scope: 'apiKey' },
    scopes,
    endpoints: [...EXTERNAL_API_ENDPOINTS],
  };
}

function methodToOpenApiMethod(method: ExternalHttpMethod): ExternalHttpMethodLower {
  if (method === 'GET') return 'get';
  if (method === 'POST') return 'post';
  if (method === 'PATCH') return 'patch';
  return 'delete';
}

function pathToOpenApiPath(path: string): string {
  return path.replace('/api/external', '');
}

function objectSchema(example: unknown): OpenApiSchemaRef {
  return { type: 'object', additionalProperties: true, example };
}

function buildParameters(endpoint: ExternalApiEndpoint): OpenApiOperation['parameters'] {
  const params: OpenApiOperation['parameters'] = [];
  const pathParamMatches = endpoint.path.matchAll(/\{([^}]+)\}/g);
  for (const match of pathParamMatches) {
    const name = match[1];
    if (name) {
      params.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
  }
  if (endpoint.queryExample) {
    params.push(
      { name: 'page', in: 'query', schema: { type: 'integer', example: 1 }, description: 'Page number.' },
      { name: 'limit', in: 'query', schema: { type: 'integer', example: 20 }, description: 'Page size.' },
    );
  }
  params.push({ name: 'x-sandbox-mode', in: 'header', schema: { type: 'boolean', example: false }, description: 'Set true to simulate write requests without mutating data.' });
  return params;
}

export function getExternalOpenApiDocument(baseUrl = 'https://api.axonerp.com'): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  const serverUrl = baseUrl.endsWith('/api/external') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/api/external`;

  for (const endpoint of EXTERNAL_API_ENDPOINTS) {
    const openApiPath = pathToOpenApiPath(endpoint.path);
    const method = methodToOpenApiMethod(endpoint.method);
    const requestBody = endpoint.requestExample === undefined
      ? undefined
      : {
          required: true,
          content: {
            'application/json': {
              schema: objectSchema(endpoint.requestExample),
              examples: { default: { value: endpoint.requestExample } },
            },
          },
        };

    paths[openApiPath] = {
      ...paths[openApiPath],
      [method]: {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: [endpoint.group],
        security: [{ ApiKeyAuth: [endpoint.scope] }],
        parameters: buildParameters(endpoint),
        requestBody,
        responses: {
          '200': {
            description: 'Successful response.',
            content: {
              'application/json': {
                schema: objectSchema(endpoint.responseExample),
                examples: { default: { value: endpoint.responseExample } },
              },
            },
          },
          '400': { description: 'Validation error.' },
          '401': { description: 'Missing or invalid API key.' },
          '403': { description: 'Missing scope, feature, or tenant access.' },
          '429': { description: 'API key rate limit exceeded.' },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Axon ERP External API',
      version: EXTERNAL_API_VERSION,
      description: 'External API surface authenticated with x-api-key and scoped permissions.',
    },
    servers: [{ url: serverUrl, description: 'Default external API server' }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
      schemas: {
        StandardError: {
          type: 'object',
          additionalProperties: true,
          example: { error: { code: 'VALIDATION_ERROR', message: 'Validation failed.' } },
        },
      },
    },
    paths,
  };
}
