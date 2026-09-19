import { ArrowRight, BrainCircuit, CircleAlert, Sparkles } from 'lucide-react';

import { Brand } from '../ui/Brand';
import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { Surface } from '../ui/Surface';

export function AiAndFooter() {
  return (
    <>
      <Section className="ai-section" eyebrow="05 / Advisory analysis">
        <Container>
          <div className="ai-section__grid">
            <div>
              <span className="feature-icon feature-icon--violet"><BrainCircuit size={20} aria-hidden="true" /></span>
              <h2>Understand what happened.</h2>
              <p>
                Ask Sentinel to summarize bounded telemetry and incident evidence. The analysis
                explains patterns; deterministic monitoring remains in control.
              </p>
              <div className="advisory-label"><CircleAlert size={14} aria-hidden="true" /> Advisory only · Generated on explicit request</div>
            </div>
            <Surface className="ai-card">
              <div className="ai-card__header"><span><Sparkles size={14} aria-hidden="true" /> Incident summary</span><small>AI analysis preview</small></div>
              <p>“Failures appeared across Mumbai and Singapore within the same evaluation window. Frankfurt remained responsive but showed elevated P95 latency.”</p>
              <div className="ai-card__evidence"><span>Evidence</span><code>2 affected regions</code><code>6 timeout results</code><code>11m 42s duration</code></div>
              <small className="ai-card__caveat">This pattern supports a multi-region outage. The underlying root cause is not proven by Sentinel evidence.</small>
            </Surface>
          </div>
        </Container>
      </Section>

      <section className="final-cta" id="final-cta">
        <Container>
          <div className="final-cta__glow" aria-hidden="true" />
          <p className="eyebrow">Built for the moment certainty matters</p>
          <h2>Your API does not fail in averages.</h2>
          <p>See the region, the evidence, and the exact moment health changed.</p>
          <ButtonLink href="#top">Start with Sentinel <ArrowRight size={16} aria-hidden="true" /></ButtonLink>
        </Container>
      </section>

      <footer className="footer">
        <Container className="footer__inner">
          <div><Brand /><p>Distributed API uptime and latency monitoring.</p></div>
          <nav aria-label="Footer navigation"><a href="#product">Product</a><a href="#monitoring">Monitoring</a><a href="#architecture">Architecture</a></nav>
          <p className="footer__status"><span /> All systems operational</p>
          <p className="footer__meta">Sentinel · Portfolio infrastructure project</p>
        </Container>
      </footer>
    </>
  );
}
