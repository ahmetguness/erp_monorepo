import Navbar from '@/components/layouts/Navbar';
import Hero from '@/components/sections/Hero';
import IntegrationEcosystem from '@/components/sections/IntegrationEcosystem';
import BeforeAfterComparison from '@/components/sections/BeforeAfterComparison';
import WorkflowBlueprint from '@/components/sections/WorkflowBlueprint';
import Features from '@/components/sections/Features';
import Benefits from '@/components/sections/Benefits';
import ArchitectureGovernance from '@/components/sections/ArchitectureGovernance';
import Sectors from '@/components/sections/Sectors';
import Roadmap from '@/components/sections/Roadmap';
import ROI from '@/components/sections/ROI';
import Deployment from '@/components/sections/Deployment';
import Pricing from '@/components/sections/Pricing';
import FAQ from '@/components/sections/FAQ';
import FinalCTA from '@/components/sections/FinalCTA';
import Footer from '@/components/layouts/Footer';
import FAB from '@/components/layouts/FAB';
import { LandingChatBot } from '@/components/shared/LandingChatBot';

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080F1E]">
      <Navbar />
      <Hero />
      <IntegrationEcosystem />
      <BeforeAfterComparison />
      <WorkflowBlueprint />
      <Features />
      <Benefits />
      <ArchitectureGovernance />
      <Sectors />
      <Roadmap />
      <ROI />
      <Deployment />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
      <FAB />
      <LandingChatBot />
    </main>
  );
}
