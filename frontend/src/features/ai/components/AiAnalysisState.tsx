import { LoaderCircle, TriangleAlert } from 'lucide-react';

import { ApiError } from '../../../api/http-client';
import type { AiAnalysis, AiFailureCode } from '../api/ai-contracts';

interface SafeMessage {
  message: string;
  retryable: boolean;
}

const terminalFailureMessages: Record<AiFailureCode, SafeMessage> = {
  AI_PROVIDER_TIMEOUT: { message: 'The AI provider timed out.', retryable: true },
  AI_PROVIDER_RATE_LIMITED: { message: 'The AI provider is temporarily rate-limited.', retryable: true },
  AI_PROVIDER_ERROR: { message: 'The AI provider could not complete this analysis.', retryable: true },
  AI_INVALID_OUTPUT: { message: 'The generated analysis could not be validated safely.', retryable: true },
  AI_CONTEXT_UNAVAILABLE: { message: 'Sentinel could not assemble enough analysis context.', retryable: true },
  AI_RESOURCE_NOT_FOUND: { message: 'The monitored resource is no longer available.', retryable: false },
  AI_QUEUE_PUBLISH_FAILED: { message: 'Sentinel could not queue this analysis.', retryable: true },
};

function requestErrorMessage(error: unknown): SafeMessage {
  if (error instanceof ApiError) {
    if (error.code === 'AI_FEATURE_DISABLED') {
      return { message: 'AI analysis is disabled for this Sentinel environment.', retryable: false };
    }
    if (error.code === 'INCIDENT_NOT_RESOLVED') {
      return { message: 'This incident must be resolved before it can be summarized.', retryable: false };
    }
    if (error.code === 'AI_QUEUE_PUBLISH_FAILED') {
      return { message: 'Sentinel could not queue the analysis. Try again shortly.', retryable: true };
    }
    if (error.code === 'INVALID_RESPONSE') {
      return { message: 'Sentinel returned analysis data that could not be read safely.', retryable: true };
    }
    if (error.code === 'NETWORK_ERROR') {
      return { message: 'Unable to reach Sentinel. Check your connection and try again.', retryable: true };
    }
  }

  return { message: 'Sentinel could not start this analysis. Try again shortly.', retryable: true };
}

export function AiAnalysisState({
  analysis,
  error,
  onRetry,
}: {
  analysis?: AiAnalysis;
  error?: unknown;
  onRetry: () => void;
}) {
  if (error) {
    const state = requestErrorMessage(error);
    return <AnalysisFailure message={state.message} retryable={state.retryable} onRetry={onRetry} />;
  }

  if (analysis?.status === 'queued' || analysis?.status === 'processing') {
    return (
      <div className="ai-analysis-state ai-analysis-state--active" role="status" aria-live="polite" aria-atomic="true">
        <LoaderCircle size={17} aria-hidden="true" />
        <div>
          <strong>{analysis.status === 'queued' ? 'Analysis queued' : 'Analyzing Sentinel evidence…'}</strong>
          <p>{analysis.status === 'queued' ? 'Waiting for an AI worker…' : 'Reviewing bounded uptime, latency, regional, and incident telemetry.'}</p>
        </div>
      </div>
    );
  }

  if (analysis?.status === 'failed') {
    const state = terminalFailureMessages[analysis.failureCode];
    return <AnalysisFailure message={state.message} retryable={state.retryable} onRetry={onRetry} />;
  }

  return null;
}

function AnalysisFailure({ message, retryable, onRetry }: SafeMessage & { onRetry: () => void }) {
  return (
    <div className="ai-analysis-state ai-analysis-state--failed" role="alert">
      <TriangleAlert size={17} aria-hidden="true" />
      <div>
        <strong>Analysis unavailable</strong>
        <p>{message}</p>
      </div>
      {retryable ? <button className="button button--secondary" type="button" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

