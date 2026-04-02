import Navbar from '@/components/layouts/Navbar';
import Hero from '@/components/sections/Hero';
import Features from '@/components/sections/Features';
import Roadmap from '@/components/sections/Roadmap';
import DeepDive from '@/components/sections/DeepDive';
import ROI from '@/components/sections/ROI';
import Sectors from '@/components/sections/Sectors';
import WhyUs from '@/components/sections/WhyUs';
import Deployment from '@/components/sections/Deployment';
import Pricing from '@/components/sections/Pricing';
import FAQ from '@/components/sections/FAQ';
import Footer from '@/components/layouts/Footer';
import FAB from '@/components/layouts/FAB';

export default function Home() {
  return (
    <main className="min-h-screen selection:bg-blue-50 selection:text-blue-900 overflow-x-hidden">
      <Navbar />
      <Hero />
      <Features />
      <Roadmap />
      <DeepDive />
      <ROI />
      <Sectors />
      <WhyUs />
      <Deployment />
      <Pricing />
      <FAQ />
      <Footer />
      <FAB />
    </main>
  );
}
