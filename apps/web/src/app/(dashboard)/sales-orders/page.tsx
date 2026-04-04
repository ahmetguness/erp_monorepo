import type { Metadata } from 'next';
import { SalesOrdersListPage } from '@/components/features/sales/SalesOrdersListPage';
export const metadata: Metadata = { title: 'Satış Siparişleri — Axon ERP' };
export default function SalesOrdersPage() { return <SalesOrdersListPage />; }
