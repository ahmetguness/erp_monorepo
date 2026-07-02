import {
  EXTERNAL_API_ENDPOINTS,
  getExternalApiManifest,
  getExternalOpenApiDocument,
  type ExternalApiEndpoint,
  type ExternalHttpMethod,
  type OpenApiDocument,
} from './external-api-registry.service.js';

interface PostmanHeader {
  key: string;
  value: string;
  type: 'text';
}

interface PostmanRequestBody {
  mode: 'raw';
  raw: string;
  options: {
    raw: {
      language: 'json';
    };
  };
}

interface PostmanRequest {
  method: ExternalHttpMethod;
  header: PostmanHeader[];
  url: {
    raw: string;
    host: string[];
    path: string[];
    query?: Array<{ key: string; value: string }>;
  };
  body?: PostmanRequestBody;
  description: string;
}

interface PostmanItem {
  name: string;
  request: PostmanRequest;
  response: Array<{
    name: string;
    originalRequest: PostmanRequest;
    status: string;
    code: number;
    body: string;
    header: Array<{ key: string; value: string }>;
  }>;
}

export interface PostmanCollection {
  info: {
    name: string;
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
    description: string;
  };
  variable: Array<{ key: string; value: string; type: 'string' }>;
  item: Array<{
    name: string;
    item: PostmanItem[];
  }>;
}

export interface IntegrationSandboxExample {
  method: ExternalHttpMethod;
  path: string;
  title: string;
  description: string;
  group: string;
  scope: string;
  sandboxSupported: boolean;
  sampleUrl: string;
  curl: string;
  requestExample?: unknown;
  responseExample: unknown;
}

export interface IntegrationSandboxPayload {
  version: string;
  baseUrl: string;
  auth: {
    apiKeyHeader: 'x-api-key';
    sandboxHeader: 'x-sandbox-mode';
    sandboxHeaderValue: 'true';
  };
  outputs: {
    manifestPath: '/api/api-keys/manifest';
    openApiPath: '/api/api-keys/openapi.json';
    postmanPath: '/api/api-keys/postman.json';
  };
  examples: IntegrationSandboxExample[];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function externalBaseUrl(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/api/external`;
}

function pathWithoutExternalPrefix(path: string): string {
  return path.replace('/api/external', '');
}

function replacePathParams(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

function samplePath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, 'sample-$1');
}

function buildCurl(endpoint: ExternalApiEndpoint, baseUrl: string): string {
  const url = `${trimTrailingSlash(baseUrl)}${samplePath(endpoint.path)}${endpoint.queryExample ?? ''}`;
  const lines = [
    `curl --request ${endpoint.method} "${url}"`,
    '  --header "x-api-key: {{apiKey}}"',
  ];

  if (endpoint.sandboxSupported && endpoint.method !== 'GET') {
    lines.push('  --header "x-sandbox-mode: true"');
  }

  if (endpoint.requestExample !== undefined) {
    lines.push('  --header "Content-Type: application/json"');
    lines.push(`  --data '${JSON.stringify(endpoint.requestExample)}'`);
  }

  return lines.join(' \\\n');
}

function buildSandboxExample(endpoint: ExternalApiEndpoint, baseUrl: string): IntegrationSandboxExample {
  const url = `${trimTrailingSlash(baseUrl)}${samplePath(endpoint.path)}${endpoint.queryExample ?? ''}`;
  return {
    method: endpoint.method,
    path: endpoint.path,
    title: endpoint.summary,
    description: endpoint.description,
    group: endpoint.group,
    scope: endpoint.scope,
    sandboxSupported: endpoint.sandboxSupported,
    sampleUrl: url,
    curl: buildCurl(endpoint, baseUrl),
    ...(endpoint.requestExample !== undefined ? { requestExample: endpoint.requestExample } : {}),
    responseExample: endpoint.responseExample,
  };
}

function groupByEndpointGroup(endpoints: readonly ExternalApiEndpoint[]): Map<string, ExternalApiEndpoint[]> {
  const grouped = new Map<string, ExternalApiEndpoint[]>();
  for (const endpoint of endpoints) {
    const group = grouped.get(endpoint.group) ?? [];
    group.push(endpoint);
    grouped.set(endpoint.group, group);
  }
  return grouped;
}

function postmanHeaders(endpoint: ExternalApiEndpoint): PostmanHeader[] {
  const headers: PostmanHeader[] = [
    { key: 'x-api-key', value: '{{apiKey}}', type: 'text' },
  ];
  if (endpoint.sandboxSupported && endpoint.method !== 'GET') {
    headers.push({ key: 'x-sandbox-mode', value: 'true', type: 'text' });
  }
  if (endpoint.requestExample !== undefined) {
    headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
  }
  return headers;
}

function queryItems(endpoint: ExternalApiEndpoint): Array<{ key: string; value: string }> | undefined {
  if (!endpoint.queryExample) return undefined;
  const params = new URLSearchParams(endpoint.queryExample.replace(/^\?/, ''));
  const query = Array.from(params.entries()).map(([key, value]) => ({ key, value }));
  return query.length > 0 ? query : undefined;
}

function postmanRequest(endpoint: ExternalApiEndpoint): PostmanRequest {
  const path = pathWithoutExternalPrefix(replacePathParams(endpoint.path)).replace(/^\//, '');
  return {
    method: endpoint.method,
    header: postmanHeaders(endpoint),
    url: {
      raw: `{{baseUrl}}/${path}${endpoint.queryExample ?? ''}`,
      host: ['{{baseUrl}}'],
      path: path.split('/').filter(Boolean),
      ...(queryItems(endpoint) ? { query: queryItems(endpoint) } : {}),
    },
    ...(endpoint.requestExample !== undefined
      ? {
          body: {
            mode: 'raw',
            raw: JSON.stringify(endpoint.requestExample, null, 2),
            options: { raw: { language: 'json' } },
          },
        }
      : {}),
    description: `${endpoint.description}\n\nRequired scope: ${endpoint.scope}`,
  };
}

function postmanItem(endpoint: ExternalApiEndpoint): PostmanItem {
  const request = postmanRequest(endpoint);
  return {
    name: endpoint.summary,
    request,
    response: [
      {
        name: 'Example response',
        originalRequest: request,
        status: 'OK',
        code: 200,
        body: JSON.stringify(endpoint.responseExample, null, 2),
        header: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ],
  };
}

export function getIntegrationSandboxPayload(baseUrl: string): IntegrationSandboxPayload {
  const manifest = getExternalApiManifest();
  return {
    version: manifest.version,
    baseUrl: externalBaseUrl(baseUrl),
    auth: {
      apiKeyHeader: 'x-api-key',
      sandboxHeader: 'x-sandbox-mode',
      sandboxHeaderValue: 'true',
    },
    outputs: {
      manifestPath: '/api/api-keys/manifest',
      openApiPath: '/api/api-keys/openapi.json',
      postmanPath: '/api/api-keys/postman.json',
    },
    examples: EXTERNAL_API_ENDPOINTS.map((endpoint) => buildSandboxExample(endpoint, baseUrl)),
  };
}

export function getIntegrationSandboxOpenApiDocument(baseUrl: string): OpenApiDocument {
  return getExternalOpenApiDocument(baseUrl);
}

export function getIntegrationSandboxPostmanCollection(baseUrl: string): PostmanCollection {
  const grouped = groupByEndpointGroup(EXTERNAL_API_ENDPOINTS);
  return {
    info: {
      name: 'Axon ERP External API Sandbox',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'API key authenticated examples. Write requests include x-sandbox-mode=true by default so they can be tested without mutating data.',
    },
    variable: [
      { key: 'baseUrl', value: externalBaseUrl(baseUrl), type: 'string' },
      { key: 'apiKey', value: 'paste-api-key-here', type: 'string' },
    ],
    item: Array.from(grouped.entries()).map(([name, endpoints]) => ({
      name,
      item: endpoints.map(postmanItem),
    })),
  };
}
