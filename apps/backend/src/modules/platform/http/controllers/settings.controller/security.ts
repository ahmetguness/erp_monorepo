import { randomUUID } from 'crypto';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import {
getSecurityHardeningSnapshot,
listSecuritySessions,
revokeSecuritySession,
} from '../../../../../services/security-hardening.service.js';
import { getTenantSecurityScore } from '../../../../../services/tenant-security.service.js';
import { getRequestMeta } from '../../../../../utils/audit.js';
import { requireTenantId,requireUserId } from '../../../../../utils/context.js';
import { readBoolean,readJsonObject,readPositiveNumber,readString } from './shared.js';

export const securitySettingsController = {
  async securityScore(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const score = await getTenantSecurityScore(prisma, tenantId);
    return c.json({ data: score });
  },
  async securityDashboard(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const snapshot = await getSecurityHardeningSnapshot(prisma, tenantId);
    return c.json({ data: snapshot });
  },
  async listSecuritySessions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const sessions = await listSecuritySessions(prisma, tenantId);
    return c.json({ data: sessions });
  },
  async revokeSecuritySession(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const sessionId = c.req.param('sessionId');
    if (!sessionId) return c.json(new ValidationError('sessionId zorunludur.').toJSON(), 400);
    const revoked = await revokeSecuritySession(prisma, tenantId, sessionId, userId, getRequestMeta(c));
    if (!revoked) return c.json(new NotFoundError('Session', sessionId).toJSON(), 404);
    return c.json({ data: revoked });
  },
  async getCorporateSecuritySettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('Kurumsal güvenlik ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const settings = await prisma.tenantSetting.findMany({
      where: {
        tenantId,
        key: { startsWith: 'security.' }
      }
    });

    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    return c.json({
      data: {
        ssoEnabled: settingsMap.get('security.sso.enabled') === 'true',
        ssoProvider: settingsMap.get('security.sso.provider') || 'saml',
        samlMetadataUrl: settingsMap.get('security.sso.saml_metadata_url') || '',
        oidcClientId: settingsMap.get('security.sso.oidc_client_id') || '',
        oidcClientSecret: settingsMap.get('security.sso.oidc_client_secret') || '',
        scimEnabled: settingsMap.get('security.scim.enabled') === 'true',
        scimToken: settingsMap.get('security.scim.token') || '',
        scimRoleSyncEnabled: settingsMap.get('security.scim.role_sync.enabled') === 'true',
        scimDefaultRoleId: settingsMap.get('security.scim.default_role_id') || '',
        scimRoleMappings: settingsMap.get('security.scim.role_mappings') || '[]',
        ipRestrictionEnabled: settingsMap.get('security.ip_restriction.enabled') === 'true',
        ipWhitelist: settingsMap.get('security.ip_whitelist') || '',
        sessionMaxAgeDays: parseInt(settingsMap.get('security.session.max_age_days') || '7', 10),
        sessionConcurrentLimit: parseInt(settingsMap.get('security.session.concurrent_limit') || '5', 10),
        sessionIdleTimeoutMins: parseInt(settingsMap.get('security.session.idle_timeout_mins') || '30', 10),
      }
    });
  },
  async updateCorporateSecuritySettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('Kurumsal güvenlik ayarları sadece Enterprise plan müşterileri içindir.');
    }

    const body = await readJsonObject(c);

    const updates = [
      { key: 'security.sso.enabled', value: readBoolean(body.ssoEnabled) ? 'true' : 'false' },
      { key: 'security.sso.provider', value: readString(body.ssoProvider, 'saml') },
      { key: 'security.sso.saml_metadata_url', value: readString(body.samlMetadataUrl) },
      { key: 'security.sso.oidc_client_id', value: readString(body.oidcClientId) },
      { key: 'security.sso.oidc_client_secret', value: readString(body.oidcClientSecret) },
      { key: 'security.scim.enabled', value: readBoolean(body.scimEnabled) ? 'true' : 'false' },
      { key: 'security.scim.role_sync.enabled', value: readBoolean(body.scimRoleSyncEnabled) ? 'true' : 'false' },
      { key: 'security.scim.default_role_id', value: readString(body.scimDefaultRoleId) },
      { key: 'security.scim.role_mappings', value: readString(body.scimRoleMappings, '[]') },
      { key: 'security.ip_restriction.enabled', value: readBoolean(body.ipRestrictionEnabled) ? 'true' : 'false' },
      { key: 'security.ip_whitelist', value: readString(body.ipWhitelist) },
      { key: 'security.session.max_age_days', value: String(readPositiveNumber(body.sessionMaxAgeDays, 7)) },
      { key: 'security.session.concurrent_limit', value: String(readPositiveNumber(body.sessionConcurrentLimit, 5)) },
      { key: 'security.session.idle_timeout_mins', value: String(readPositiveNumber(body.sessionIdleTimeoutMins, 30)) },
    ];

    for (const update of updates) {
      await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: update.key } },
        create: { tenantId, key: update.key, value: update.value },
        update: { value: update.value }
      });
    }

    return c.json({ data: { success: true } });
  },
  async generateScimToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true }
    });

    if (tenant?.plan !== 'ENTERPRISE') {
      throw new ValidationError('SCIM provizyonlama sadece Enterprise plan müşterileri içindir.');
    }

    const token = 'scim_' + randomUUID().replace(/-/g, '');

    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: 'security.scim.token' } },
      create: { tenantId, key: 'security.scim.token', value: token },
      update: { value: token }
    });

    return c.json({ data: { token } });
  },
} as const;
