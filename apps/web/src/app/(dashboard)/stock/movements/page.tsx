import type { Metadata } from 'next';
import { StockMovementsPage } from '@/components/features/stock/StockMovementsPage';
export const metadata: Metadata = { title: 'Stok Hareketleri — Axon ERP' };
export default function StockMovements() { return <StockMovementsPage />; }
