import { ArrowRight, BrainCircuit, CircleAlert, Sparkles } from 'lucide-react';
import { m } from 'motion/react';

import { useElementVisibility } from '../../hooks/useElementVisibility';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';
import { Brand } from '../ui/Brand';
import { ButtonRouteLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { Section } from '../ui/Section';
import { Reveal } from './MarketingMotion';
import { sentinelEase } from './motion-config';

export function AiAndFooter() {
  const { ref: finalCtaRef, isVisible: finalCtaVisible } = useElementVisibility<HTMLElement>();
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <>
      <Section className="ai-section" eyebrow="05 / Advisory analysis">
        <Container>
          <div className="ai-section__grid">
            <Reveal distance={24}>
              <m.span
                className="feature-icon feature-icon--violet"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.82 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, ease: sentinelEase }}
              >
                <BrainCircuit size={20} aria-hidden="true" />
              </m.span>
              <h2>Understand what happened.</h2>
              <p>
                Ask Sentinel to summarize bounded telemetry and incident evidence. The analysis
                explains patterns; deterministic monitoring remains in control.
              </p>
              <div className="advisory-label"><CircleAlert size={14} aria-hidden="true" /> Advisory only · Generated on explicit request</div>
            </Reveal>
            <m.div
              className="surface ai-card"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 26, scale: 0.985 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.68, delay: 0.08, ease: sentinelEase }}
            >
              <div className="ai-card__header"><span><Sparkles size={14} aria-hidden="true" /> Incident summary</span><small>AI analysis preview</small></div>
              <p>“Failures appeared across Mumbai and Singapore within the same evaluation window. Frankfurt remained responsive but showed elevated P95 latency.”</p>
              <div className="ai-card__evidence">
                <span>Evidence</span>
                {['2 affected regions', '6 timeout results', '11m 42s duration'].map((evidence, index) => (
                  <m.code
                    key={evidence}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 7 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.36, delay: 0.3 + index * 0.07, ease: sentinelEase }}
                  >
                    {evidence}
                  </m.code>
                ))}
              </div>
              <small className="ai-card__caveat">This pattern supports a multi-region outage. The underlying root cause is not proven by Sentinel evidence.</small>
            </m.div>
          </div>
        </Container>
      </Section>

      <section ref={finalCtaRef} className={cn('final-cta', finalCtaVisible && !prefersReducedMotion && 'final-cta--active')} id="final-cta">
        <Container>
          <div className="final-cta__glow" aria-hidden="true" />
          <Reveal distance={24}>
            <p className="eyebrow">Built for the moment certainty matters</p>
            <h2>Your API does not fail in averages.</h2>
            <p>See the region, the evidence, and the exact moment health changed.</p>
            <ButtonRouteLink to="/register">Start with Sentinel <ArrowRight size={16} aria-hidden="true" /></ButtonRouteLink>
          </Reveal>
        </Container>
      </section>

      <m.footer
        className="footer"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.65 }}
      >
        <Container className="footer__inner">
          <div><Brand /><p>Distributed API uptime and latency monitoring.</p></div>
          <nav aria-label="Footer navigation"><a href="#product">Product</a><a href="#monitoring">Monitoring</a><a href="#architecture">Architecture</a></nav>
          <p className="footer__status"><span /> All systems operational</p>
          <p className="footer__meta">Sentinel · Portfolio infrastructure project</p>
        </Container>
      </m.footer>
    </>
  );
}
