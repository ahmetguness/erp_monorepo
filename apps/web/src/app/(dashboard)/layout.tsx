import { Sidebar } from '@/components/shared/Sidebar';
import { Header } from '@/components/shared/Header';
import { ChatBot } from '@/components/shared/ChatBot';
import { DemoBanner } from '@/components/shared/DemoBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    </div>
  );
}
