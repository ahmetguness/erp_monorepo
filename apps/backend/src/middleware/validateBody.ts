import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';

const VALIDATED_BODY_KEY = 'validatedBody';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type JsonBodyReadResult =
  | { ok: true; body: unknown; hasBody: boolean }
  | { ok: false; hasBody: true };

function toValidationFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'body';
    fields[field] = issue.message;
  }

  return fields;
}

export function validateBody<T>(schema: z.ZodType<T>): MiddlewareHandler {
  return async (c, next) => {
    const parsed = await readJsonBody(c);
    const body = parsed.ok ? parsed.body : null;
    const result = schema.safeParse(body);

    if (!result.success) {
      return c.json(
        new ValidationError('Gecersiz istek verisi.', toValidationFields(result.error)).toJSON(),
        400,
      );
    }

    c.set(VALIDATED_BODY_KEY, result.data);
    await next();
  };
}

export function getValidatedBody<T>(c: Context, schema: z.ZodType<T>): T {
  const result = schema.safeParse(c.get(VALIDATED_BODY_KEY));
  if (!result.success) {
    throw new ValidationError('Gecersiz istek verisi.', toValidationFields(result.error));
  }

  return result.data;
}

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().split(';')[0].trim().endsWith('/json')
    || contentType.toLowerCase().split(';')[0].trim().endsWith('+json')
    || contentType.toLowerCase().split(';')[0].trim() === 'application/json';
}

async function readJsonBody(c: Context): Promise<JsonBodyReadResult> {
  const text = await c.req.raw.clone().text().catch(() => '');
  if (text.trim().length === 0) {
    return { ok: true, body: null, hasBody: false };
  }

  try {
    return { ok: true, body: JSON.parse(text) as unknown, hasBody: true };
  } catch {
    return { ok: false, hasBody: true };
  }
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findForbiddenJsonPath(value: unknown, path = 'body'): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = findForbiddenJsonPath(value[index], `${path}.${index}`);
      if (nestedPath) return nestedPath;
    }
    return null;
  }

  if (!isPlainJsonObject(value)) return null;

  for (const [key, nestedValue] of Object.entries(value)) {
    const currentPath = `${path}.${key}`;
    if (FORBIDDEN_OBJECT_KEYS.has(key)) {
      return currentPath;
    }

    const nestedPath = findForbiddenJsonPath(nestedValue, currentPath);
    if (nestedPath) return nestedPath;
  }

  return null;
}

function hasReadableBody(c: Context): boolean {
  const contentLength = c.req.header('content-length');
  if (contentLength && contentLength !== '0') return true;
  return Boolean(c.req.header('transfer-encoding'));
}

export const validateJsonRequestBody: MiddlewareHandler = async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const contentType = c.req.header('content-type');
  if (!isJsonContentType(contentType)) {
    await next();
    return;
  }

  const parsed = await readJsonBody(c);
  if (!parsed.ok) {
    return c.json(
      new ValidationError('Gecersiz istek verisi.', { body: 'JSON body parse edilemedi.' }).toJSON(),
      400,
    );
  }

  const body = parsed.body;
  if (!parsed.hasBody && !hasReadableBody(c)) {
    await next();
    return;
  }

  if (!isPlainJsonObject(body)) {
    return c.json(
      new ValidationError('Gecersiz istek verisi.', { body: 'JSON body nesne olmalidir.' }).toJSON(),
      400,
    );
  }

  const forbiddenPath = findForbiddenJsonPath(body);
  if (forbiddenPath) {
    return c.json(
      new ValidationError('Gecersiz istek verisi.', { [forbiddenPath]: 'Bu alan client tarafindan gonderilemez.' }).toJSON(),
      400,
    );
  }

  await next();
};

