import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Giriş — Axon ERP',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-white tracking-tight">
            Axon <span className="text-sky-400">ERP</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
