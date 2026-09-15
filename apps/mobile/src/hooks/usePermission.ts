import { useMemo } from 'react';
import { useAuthStore } from '../store/auth.store';

export function usePermission() {
  const user = useAuthStore((state) => state.user);
  const tenant = useAuthStore((state) => state.tenant);

  const isOwner = Boolean(user?.tenantMembership?.isOwner);

  const permissions = useMemo(() => {
    return user?.tenantMembership?.role?.permissions || [];
  }, [user]);

  const enabledModules = useMemo(() => {
    if (!tenant?.modules) return [];
    if (Array.isArray(tenant.modules)) return tenant.modules;
    if (typeof tenant.modules === 'string') {
      return (tenant.modules as string).split(' ').filter(Boolean);
    }
    return [];
  }, [tenant]);

  const hasModule = (moduleName: string): boolean => {
    return enabledModules.includes(moduleName);
  };

  const hasPermission = (moduleName: string, action?: string): boolean => {
    // 1. Owner always has full access
    if (isOwner) return true;

    // 2. Check if the module is enabled for tenant
    if (!hasModule(moduleName)) return false;

    // 3. Check role permissions
    if (!action) {
      // Any action on module
      return permissions.some((p) => p.module === moduleName);
    }

    return permissions.some(
      (p) => p.module === moduleName && (p.action === action || p.action === '*')
    );
  };

  const isPlan = (plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'): boolean => {
    return tenant?.plan === plan;
  };

  const hasProfessionalOrAbove = useMemo(() => {
    return tenant?.plan === 'PROFESSIONAL' || tenant?.plan === 'ENTERPRISE';
  }, [tenant]);

  const hasEnterprise = useMemo(() => {
    return tenant?.plan === 'ENTERPRISE';
  }, [tenant]);

  const isTenantActive = useMemo(() => {
    return tenant?.status === 'ACTIVE' || tenant?.status === 'TRIAL';
  }, [tenant]);

  return {
    isOwner,
    hasModule,
    hasPermission,
    isPlan,
    hasProfessionalOrAbove,
    hasEnterprise,
    isTenantActive,
    tenantPlan: tenant?.plan || 'STARTER',
    tenantModules: enabledModules,
  };
}
