import { Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { AiAnalysis, MonitorHealthAiResult } from '../api/ai-contracts';
import { useAiAnalysis, useRequestMonitorInsight } from '../hooks/use-ai-analysis';
import { AiAnalysisState } from './AiAnalysisState';

const LOOKBACK_OPTIONS = [
  { label: '6 hours', value: 6 },
  { label: '24 hours', value: 24 },
  { label: '72 hours', value: 72 },
  { label: '7 days', value: 168 },
] as const;

export function MonitorAiInsight({ monitorId }: { monitorId: string }) {
  const [lookbackHours, setLookbackHours] = useState(24);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const request = useRequestMonitorInsight(monitorId);
  const analysisQuery = useAiAnalysis(analysisId);
  const analysis = analysisQuery.data;
  const active = request.isPending || analysis?.status === 'queued' || analysis?.status === 'processing';
  const stateError = request.error ?? analysisQuery.error;
  const retryTracking = analysisQuery.isError && !request.isError;

  const generate = async () => {
    request.reset();
    const created = await request.mutateAsync(lookbackHours).catch(() => null);
    if (created) setAnalysisId(created.id);
  };

  return (
    <section className="operational-section ai-advisory-panel" aria-labelledby="monitor-ai-title">
      <AdvisoryHeading
        id="monitor-ai-title"
        title="Understand recent monitor health"
        description="Sentinel AI can summarize bounded uptime, latency, regional, and incident evidence. Its assessment is advisory and never changes monitor state."
      />
      <div className="ai-advisory-panel__controls">
        <label>
          Analysis window
          <select
            aria-label="AI analysis window"
            value={lookbackHours}
            disabled={active}
            onChange={(event) => setLookbackHours(Number(event.target.value))}
          >
            {LOOKBACK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="button button--secondary ai-generate-button" type="button" disabled={active} onClick={() => void generate()}>
          <Sparkles size={14} aria-hidden="true" />
          {active ? 'Analysis in progress…' : analysis?.status === 'completed' || analysis?.status === 'failed' ? 'Generate new insight' : 'Generate insight'}
        </button>
      </div>

      <AiAnalysisState
        analysis={analysis}
        error={stateError}
        onRetry={() => retryTracking ? void analysisQuery.refetch() : void generate()}
      />
      {analysis?.type === 'monitor_health' && analysis.status === 'completed' ? <MonitorInsightResult analysis={analysis} result={analysis.result} /> : null}
    </section>
  );
}

function AdvisoryHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <header className="ai-advisory-panel__heading">
      <span className="ai-advisory-panel__icon"><Sparkles size={17} aria-hidden="true" /></span>
      <div>
        <p className="eyebrow">Advisory analysis</p>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function MonitorInsightResult({ analysis, result }: { analysis: Extract<AiAnalysis, { type: 'monitor_health'; status: 'completed' }>; result: MonitorHealthAiResult }) {
  return (
    <article
      className="ai-result app-state-enter"
      aria-labelledby={`ai-result-${analysis.id}`}
    >
      <header>
        <div><p className="eyebrow">Advisory health insight</p><h3 id={`ai-result-${analysis.id}`}>Recent telemetry assessment</h3></div>
        <span className="ai-risk-label">AI risk assessment: <strong>{capitalize(result.reliabilityRisk)}</strong></span>
      </header>
      <ResultSection title="Summary"><p>{result.summary}</p></ResultSection>
      <div className="ai-result__columns">
        <ResultList title="Observations" items={result.observations} />
        <ResultList title="Regional findings" items={result.regionalFindings} />
        <ResultList title="Latency findings" items={result.latencyFindings} />
      </div>
      <ResultList title="Caveats" items={result.caveats} caveat />
    </article>
  );
}

export function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ai-result__section"><h4>{title}</h4>{children}</section>;
}

export function ResultList({ title, items, caveat = false }: { title: string; items: string[]; caveat?: boolean }) {
  return (
    <section className={`ai-result__section${caveat ? ' ai-result__section--caveat' : ''}`}>
      <h4>{title}</h4>
      {items.length > 0 ? <ul>{items.map((item, index) => <li key={`${title}-${String(index)}`}>{item}</li>)}</ul> : <p>No findings were returned for this category.</p>}
    </section>
  );
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
