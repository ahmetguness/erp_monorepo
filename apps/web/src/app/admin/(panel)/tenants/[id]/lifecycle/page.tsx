import { TenantLifecyclePage } from '@/components/features/admin/tenant-lifecycle/TenantLifecyclePage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenantLifecyclePage tenantId={id} />;
}
