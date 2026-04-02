import Navbar from '@/components/layouts/Navbar';
import Hero from '@/components/sections/Hero';
import Features from '@/components/sections/Features';
import Roadmap from '@/components/sections/Roadmap';
import ROI from '@/components/sections/ROI';
import Deployment from '@/components/sections/Deployment';
import Pricing from '@/components/sections/Pricing';
import FAQ from '@/components/sections/FAQ';
import Footer from '@/components/layouts/Footer';
import FAB from '@/components/layouts/FAB';

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0F172A]">
      <Navbar />
      <Hero />
      <Features />
      <Roadmap />
      <ROI />
      <Deployment />
      <Pricing />
      <FAQ />
      <div className="h-px bg-slate-800" />
      <Footer />
      <FAB />
    </main>
  );
}
