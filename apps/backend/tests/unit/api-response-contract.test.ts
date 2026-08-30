import { describe, expect, it } from 'vitest';
import { ConflictError, StateTransitionError } from '../../src/modules/shared/domain/errors/application-error.js';
import { errorStatus } from '../../src/modules/shared/http/error-status.js';
import { normalizeErrorBody } from '../../src/modules/shared/http/response-contract.middleware.js';
import { getExternalOpenApiDocument } from '../../src/services/external-api-registry.service.js';

describe('API response contract', () => {
  it('normalizes legacy controller errors at the HTTP boundary', () => {
    expect(normalizeErrorBody({ error: 'Geçersiz istek.' }, 400, 'req-1')).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Geçersiz istek.', requestId: 'req-1' },
    });
  });

  it('preserves standardized errors and attaches trace identity', () => {
    expect(normalizeErrorBody({ error: { code: 'NOT_FOUND', message: 'Yok.' } }, 404, 'req-2')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Yok.', requestId: 'req-2' },
    });
  });

  it('keeps domain errors independent from HTTP and maps them centrally', () => {
    expect(errorStatus(new ConflictError('Çakışma').category)).toBe(409);
    expect(errorStatus(new StateTransitionError('Geçersiz durum').category)).toBe(422);
  });

  it('publishes the central error schema in generated OpenAPI responses', () => {
    const document = getExternalOpenApiDocument('https://example.test');
    expect(document.components.schemas.StandardError?.required).toContain('error');
    const operation = document.paths['/products']?.get;
    expect(operation?.responses['400']?.content?.['application/json'].schema.$ref)
      .toBe('#/components/schemas/StandardError');
  });
});
