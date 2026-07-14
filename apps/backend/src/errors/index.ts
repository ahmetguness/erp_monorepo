// ─────────────────────────────────────────────
import type { FeatureKey, Plan, TenantStatus } from '@prisma/client';
import type { PlanDowngradeLockReason } from '../services/plan-downgrade-access.service';

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

export class TenantInactiveError extends BaseError {
  public readonly status: TenantStatus;

  constructor(status: TenantStatus) {
    super(
      `Tenant durumu ${status} oldugu icin plan, modul ve feature erisimi sinirlandirilmistir.`,
      403,
      'TENANT_INACTIVE',
    );
    this.status = status;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: { status: this.status },
      },
    };
  }
}

interface PlanDowngradeLockedDetails {
  reason: PlanDowngradeLockReason;
  accessMode: 'read_only';
  currentPlan?: Plan;
  requiredPlan?: Plan;
  module?: string;
  featureKey?: FeatureKey;
}

export class PlanDowngradeLockedError extends BaseError {
  public readonly details: PlanDowngradeLockedDetails;

  constructor(details: PlanDowngradeLockedDetails) {
    super(
      'Plan degisikligi nedeniyle bu alan read-only kilitlidir. Mevcut veriler korunur, yeni kayit veya guncelleme icin plan/modul/feature erisimi gerekir.',
      403,
      'PLAN_DOWNGRADE_LOCKED',
    );
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
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
