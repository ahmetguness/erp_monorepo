import type { PermissionAction, PrismaClient } from '@prisma/client';
import { ForbiddenError } from '../../../../errors/index.js';
import { getTenantPermissionContext } from '../../../../lib/tenant-permissions.js';
import { SearchService } from '../../../../services/search.service.js';
import type { UnifiedPermissionAction, UnifiedPermissionPort, UnifiedSearchPort } from '../../application/unified-command/index.js';

export class PrismaUnifiedPermissionAdapter implements UnifiedPermissionPort {
  async getContext(tenantId: string, userId: string) {
    const context = await getTenantPermissionContext(tenantId, userId);
    if (!context) return null;
    return { can: (action: UnifiedPermissionAction, module: string) => context.can(action as PermissionAction, module) };
  }
}

export class PrismaUnifiedSearchAdapter implements UnifiedSearchPort {
  private readonly service: SearchService;

  constructor(db: PrismaClient) {
    this.service = new SearchService(db);
  }

  async search(input: { tenantId: string; userId: string; query: string; limit: number }) {
    const result = await this.service.global(input);
    return result instanceof ForbiddenError ? null : result.data;
  }
}
