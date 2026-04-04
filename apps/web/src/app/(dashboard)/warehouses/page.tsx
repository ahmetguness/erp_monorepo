import type { Metadata } from 'next';
import { WarehousesListPage } from '@/components/features/stock/WarehousesListPage';
export const metadata: Metadata = { title: 'Depolar — Axon ERP' };
export default function WarehousesPage() { return <WarehousesListPage />; }
