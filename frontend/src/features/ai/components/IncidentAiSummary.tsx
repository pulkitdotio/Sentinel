import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { Incident } from '../../incidents/api/incident-contracts';
import { regionLabel } from '../../metrics/metric-formatters';
import { useAiAnalysis, useRequestIncidentSummary } from '../hooks/use-ai-analysis';
import { AiAnalysisState } from './AiAnalysisState';
import { ResultList, ResultSection } from './MonitorAiInsight';

export function IncidentAiSummary({ incident }: { incident: Incident }) {
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const request = useRequestIncidentSummary(incident.id);
  const analysisQuery = useAiAnalysis(analysisId);
  const analysis = analysisQuery.data;
  const active = request.isPending || analysis?.status === 'queued' || analysis?.status === 'processing';
  const resolved = incident.status === 'resolved';
  const stateError = request.error ?? analysisQuery.error;
  const retryTracking = analysisQuery.isError && !request.isError;

  const generate = async () => {
    if (!resolved) return;
    request.reset();
    const created = await request.mutateAsync().catch(() => null);
    if (created) setAnalysisId(created.id);
  };

  return (
    <section className="operational-section ai-advisory-panel" aria-labelledby="incident-ai-title">
      <header className="ai-advisory-panel__heading">
        <span className="ai-advisory-panel__icon"><Sparkles size={17} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Advisory analysis</p>
          <h2 id="incident-ai-title">Summarize this incident</h2>
          <p>{resolved ? 'Ask Sentinel AI to summarize this resolved incident from its bounded timeline and regional evidence.' : 'AI summaries become available after the incident is resolved.'}</p>
        </div>
      </header>
      <div className="ai-advisory-panel__controls ai-advisory-panel__controls--single">
        <button className="button button--secondary ai-generate-button" type="button" disabled={!resolved || active} onClick={() => void generate()}>
          <Sparkles size={14} aria-hidden="true" />
          {active ? 'Analysis in progress…' : analysis?.status === 'completed' || analysis?.status === 'failed' ? 'Generate new summary' : 'Generate summary'}
        </button>
      </div>

      <AiAnalysisState
        analysis={analysis}
        error={stateError}
        onRetry={() => retryTracking ? void analysisQuery.refetch() : void generate()}
      />
      {analysis?.type === 'incident_summary' && analysis.status === 'completed' ? (
        <article className="ai-result" aria-labelledby={`ai-result-${analysis.id}`}>
          <header><div><p className="eyebrow">Advisory incident analysis</p><h3 id={`ai-result-${analysis.id}`}>Resolved incident summary</h3></div></header>
          <div className="ai-result__columns ai-result__columns--two">
            <ResultSection title="Incident summary"><p>{analysis.result.summary}</p></ResultSection>
            <ResultSection title="Timeline summary"><p>{analysis.result.timelineSummary}</p></ResultSection>
          </div>
          <ResultSection title="Affected regions">
            {analysis.result.affectedRegions.length > 0 ? <div className="ai-region-list">{analysis.result.affectedRegions.map((region) => <span key={region}>{regionLabel(region)}</span>)}</div> : <p>No affected regions were identified.</p>}
          </ResultSection>
          <ResultSection title="Likely pattern"><p>{analysis.result.likelyPattern}</p></ResultSection>
          <ResultList title="Evidence" items={analysis.result.evidence} />
          <ResultList title="Caveats" items={analysis.result.caveats} caveat />
        </article>
      ) : null}
    </section>
  );
}
