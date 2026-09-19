import { AiAndFooter } from '../components/marketing/AiAndFooter';
import { ArchitectureBand } from '../components/marketing/ArchitectureBand';
import { DistributedMonitoring } from '../components/marketing/DistributedMonitoring';
import { Hero } from '../components/marketing/Hero';
import { IncidentRealtime } from '../components/marketing/IncidentRealtime';
import { Navbar } from '../components/marketing/Navbar';
import { ProductShowcase } from '../components/marketing/ProductShowcase';

export function LandingPage() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#product">Skip to product overview</a>
      <Navbar />
      <Hero />
      <ArchitectureBand />
      <DistributedMonitoring />
      <ProductShowcase />
      <IncidentRealtime />
      <AiAndFooter />
    </div>
  );
}
