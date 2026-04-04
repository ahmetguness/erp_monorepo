import type { Metadata } from 'next';
import { StockCountsPage } from '@/components/features/stock/StockCountsPage';
export const metadata: Metadata = { title: 'Stok Sayımları — Axon ERP' };
export default function StockCounts() { return <StockCountsPage />; }
