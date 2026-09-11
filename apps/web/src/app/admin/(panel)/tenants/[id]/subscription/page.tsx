import { SubscriptionOperationsPage } from '@/components/features/admin/subscription/SubscriptionOperationsPage';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SubscriptionOperationsPage tenantId={id} />; }
