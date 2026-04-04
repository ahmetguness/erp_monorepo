import type { Metadata } from 'next';
import { StockLevelsPage } from '@/components/features/stock/StockLevelsPage';
export const metadata: Metadata = { title: 'Stok Seviyeleri — Axon ERP' };
export default function StockLevels() { return <StockLevelsPage />; }
