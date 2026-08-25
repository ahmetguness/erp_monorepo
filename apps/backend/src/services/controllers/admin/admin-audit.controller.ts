import { requireParam } from '../../../utils/context.js';
import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { setCookie, deleteCookie } from 'hono/cookie';
import { AppModule, AuditAction, EntityType, FeatureKey, FeatureType, Plan, Prisma, TenantStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ValidationError, NotFoundError } from '../../../errors';
import { getPaginationParams } from '../../../utils/pagination.js';
import { createAuditLog, getRequestMeta } from '../../../utils/audit.js';
import { sendMail } from '../../mail.service.js';
import { tenantReadyEmail } from '../../mail-templates.service.js';
import { getObservabilitySnapshot } from '../../observability.service.js';
import { rateLimiter } from '../../../lib/rateLimiter';
import { logger } from '../../../lib/logger';
import { getTrustedClientIp } from '../../../utils/request-ip.js';
import { modulesForPrismaPlan, toAppModule, VALID_MODULE_KEYS } from '../../../utils/tenant-modules';
import { PlanFeatureService } from '../../plan-feature.service';
import { PlanChangeExperienceService } from '../../plan-change-experience.service';
import { JWT_SECRET, ADMIN_JWT_SECRET, IS_PRODUCTION, RESOLVED_ADMIN_SECRET, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS, ADMIN_LOGIN_LOCKOUT_FAILURES, ADMIN_LOGIN_LOCKOUT_WINDOW_MS, VALID_PLANS, VALID_STATUSES, VALID_FEATURE_KEYS, VALID_FEATURE_TYPES, VALID_MODULES, planFeatureService, planChangeExperienceService, normalizeEmail, getClientIp, getAdminLoginLimitKeys, recordAdminLoginFailure, isFeatureKey, isPlan, isFeatureType, createSlug, parseNullableDate, validateModules, normalizePlanFeatureValue, getPlanFeatureAuditTenantIds, formatNotificationValue, MODULE_TRANSLATIONS, translateModules, buildChangeLine, notifyTenantOwners } from './shared.js';

export const AdminAuditController = {

  async list(c: Context): Promise<Response> {
    const { page, limit, skip } = getPaginationParams(c, 50);
    const tenantId = c.req.query('tenantId');
    const module = c.req.query('module');
    const action = c.req.query('action');

    // Action enum validasyonu
    const VALID_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'EXPORT', 'LOGIN', 'LOGOUT', 'OTHER'];
    if (action && !VALID_ACTIONS.includes(action)) {
      return c.json(new ValidationError(`Geçersiz action. Geçerli değerler: ${VALID_ACTIONS.join(', ')}`).toJSON(), 400);
    }

    const where = {
      ...(tenantId && { tenantId }),
      ...(module && { module }),
      ...(action && { action: action as AuditAction }),
    };

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data: logs, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },
};
