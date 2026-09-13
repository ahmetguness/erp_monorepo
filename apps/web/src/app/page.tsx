import Navbar from '@/components/layouts/Navbar';
import Hero from '@/components/sections/Hero';
import BeforeAfterComparison from '@/components/sections/BeforeAfterComparison';
import WorkflowBlueprint from '@/components/sections/WorkflowBlueprint';
import Features from '@/components/sections/Features';
import ArchitectureGovernance from '@/components/sections/ArchitectureGovernance';
import Sectors from '@/components/sections/Sectors';
import Roadmap from '@/components/sections/Roadmap';
import ROI from '@/components/sections/ROI';
import Deployment from '@/components/sections/Deployment';
import Pricing from '@/components/sections/Pricing';
import FAQ from '@/components/sections/FAQ';
import Footer from '@/components/layouts/Footer';
import FAB from '@/components/layouts/FAB';
import { LandingChatBot } from '@/components/shared/LandingChatBot';

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0F172A]">
      <Navbar />
      <Hero />
      <BeforeAfterComparison />
      <WorkflowBlueprint />
      <Features />
      <ArchitectureGovernance />
      <Sectors />
      <Roadmap />
      <ROI />
      <Deployment />
      <Pricing />
      <FAQ />
      <div className="h-px bg-slate-800" />
      <Footer />
      <FAB />
      <LandingChatBot />
    </main>
  );
}

