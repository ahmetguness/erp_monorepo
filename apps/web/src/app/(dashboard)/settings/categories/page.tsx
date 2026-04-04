import type { Metadata } from 'next';
import { CategoriesManager } from '@/components/features/settings/CategoriesManager';

export const metadata: Metadata = { title: 'Kategoriler — Axon ERP' };

export default function CategoriesPage() {
  return <CategoriesManager />;
}
