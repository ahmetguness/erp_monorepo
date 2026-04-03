// ─────────────────────────────────────────────
// Custom Error Classes
// ─────────────────────────────────────────────

export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = 'Bu işlem için yetkiniz bulunmamaktadır.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class LimitExceededError extends BaseError {
  public readonly limit: number;
  public readonly current: number;

  constructor(resource: string, limit: number, current: number) {
    super(
      `${resource} limiti aşıldı. Mevcut: ${current}, Limit: ${limit}.`,
      403,
      'LIMIT_EXCEEDED',
    );
    this.limit = limit;
    this.current = current;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: { limit: this.limit, current: this.current },
      },
    };
  }
}

export class FeatureDisabledError extends BaseError {
  public readonly featureKey: string;

  constructor(featureKey: string) {
    super(
      `"${featureKey}" özelliği mevcut planınızda aktif değildir.`,
      403,
      'FEATURE_DISABLED',
    );
    this.featureKey = featureKey;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: { featureKey: this.featureKey },
      },
    };
  }
}

export class ModuleDisabledError extends BaseError {
  public readonly module: string;

  constructor(module: string) {
    super(
      `"${module}" modülü mevcut planınızda aktif değildir.`,
      403,
      'MODULE_DISABLED',
    );
    this.module = module;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: { module: this.module },
      },
    };
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} bulunamadı: ${id}` : `${resource} bulunamadı.`,
      404,
      'NOT_FOUND',
    );
  }
}

export class ValidationError extends BaseError {
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields && { fields: this.fields }),
      },
    };
  }
}
