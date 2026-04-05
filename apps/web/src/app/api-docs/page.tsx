import type { Metadata } from 'next';
import ApiDocs from '@/components/sections/ApiDocs';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API Dokümantasyonu — Axon ERP',
  description: 'Axon ERP REST API referansı. Ürünler, cari hesaplar, faturalar, stok ve siparişler için entegrasyon endpoint\'leri.',
};

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-[#0F172A]">
      {/* Minimal header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 transition-colors">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-white">
              Axon<span className="text-blue-400">ERP</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400 hidden sm:block">API Dokümantasyonu</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">v1.0</span>
            <Link href="/" className="text-xs text-slate-500 hover:text-white transition-colors ml-2">← Ana Sayfa</Link>
          </div>
        </div>
      </header>

      <ApiDocs />

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-slate-600">
          <span>© 2026 Axon ERP. Tüm hakları saklıdır.</span>
          <Link href="/" className="hover:text-slate-400 transition-colors">Ana Sayfa</Link>
        </div>
      </footer>
    </main>
  );
}
