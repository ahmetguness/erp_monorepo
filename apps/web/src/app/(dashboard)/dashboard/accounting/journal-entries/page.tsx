import type { Metadata } from 'next';
import { JournalEntriesPage } from '@/components/features/accounting/JournalEntriesPage';
export const metadata: Metadata = { title: 'Yevmiye Fişleri — Axon ERP' };
export default function JournalPage() { return <JournalEntriesPage />; }
