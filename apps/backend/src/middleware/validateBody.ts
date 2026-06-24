import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';

const VALIDATED_BODY_KEY = 'validatedBody';

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
    const body = await c.req.json().catch((): unknown => null);
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
