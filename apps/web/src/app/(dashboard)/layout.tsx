'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { useMe } from '@/hooks/useAuth';
import { Sidebar } from '@/components/shared/Sidebar';
import { Header } from '@/components/shared/Header';
import { ChatBot } from '@/components/shared/ChatBot';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { Spinner } from '@/components/ui/Spinner';
import { OnboardingTooltip } from '@/components/shared/OnboardingTooltip';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Sayfa yüklendiğinde /api/auth/me'den güncel plan + modules çek → store'a yaz
  useMe();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  // Auth yoksa login'e yönlenene kadar spinner göster (beyaz ekranı önler)
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <DemoBanner />
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <ChatBot />
      <OnboardingTooltip />
    </div>
  );
}
