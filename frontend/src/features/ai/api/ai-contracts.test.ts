import { describe, expect, it } from 'vitest';

import { aiAnalysisSchema } from './ai-contracts';

const ANALYSIS_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MONITOR_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const INCIDENT_ID = 'cccccccccccccccccccccccc';

const base = {
  id: ANALYSIS_ID,
  monitorId: MONITOR_ID,
  inputWindow: { from: '2026-09-19T10:00:00.000Z', to: '2026-09-20T10:00:00.000Z' },
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const monitorResult = {
  summary: 'The monitor was mostly reliable.',
  observations: ['Availability remained stable.'],
  regionalFindings: ['Mumbai had one isolated failure.'],
  latencyFindings: ['P95 latency remained below the warning threshold.'],
  reliabilityRisk: 'low' as const,
  caveats: ['This assessment uses only the selected Sentinel telemetry window.'],
};

const incidentResult = {
  summary: 'The incident was short and regionally correlated.',
  timelineSummary: 'Failures crossed consensus before recovery completed.',
  affectedRegions: ['mumbai', 'singapore'],
  likelyPattern: 'A shared upstream availability interruption is consistent with the evidence.',
  evidence: ['Two regions reached the configured failure threshold.'],
  caveats: ['Sentinel telemetry cannot confirm the underlying root cause.'],
};

describe('AI analysis network contract', () => {
  it.each(['queued', 'processing'] as const)('parses a valid %s analysis', (status) => {
    expect(aiAnalysisSchema.safeParse({
      ...base,
      type: 'monitor_health',
      incidentId: null,
      status,
      result: null,
      failureCode: null,
      completedAt: null,
    }).success).toBe(true);
  });

  it('parses a completed monitor analysis', () => {
    expect(aiAnalysisSchema.safeParse({
      ...base,
      type: 'monitor_health',
      incidentId: null,
      status: 'completed',
      result: monitorResult,
      failureCode: null,
      completedAt: '2026-09-20T10:01:00.000Z',
    }).success).toBe(true);
  });

  it('parses a completed incident analysis', () => {
    expect(aiAnalysisSchema.safeParse({
      ...base,
      type: 'incident_summary',
      incidentId: INCIDENT_ID,
      status: 'completed',
      result: incidentResult,
      failureCode: null,
      completedAt: '2026-09-20T10:01:00.000Z',
    }).success).toBe(true);
  });

  it('parses a failed analysis', () => {
    expect(aiAnalysisSchema.safeParse({
      ...base,
      type: 'incident_summary',
      incidentId: INCIDENT_ID,
      status: 'failed',
      result: null,
      failureCode: 'AI_PROVIDER_TIMEOUT',
      completedAt: '2026-09-20T10:01:00.000Z',
    }).success).toBe(true);
  });

  it('rejects a result that does not correspond to the analysis type', () => {
    expect(aiAnalysisSchema.safeParse({
      ...base,
      type: 'monitor_health',
      incidentId: null,
      status: 'completed',
      result: incidentResult,
      failureCode: null,
      completedAt: '2026-09-20T10:01:00.000Z',
    }).success).toBe(false);
  });

  it('rejects malformed provider-like output and invalid lifecycle combinations', () => {
    expect(aiAnalysisSchema.safeParse({
      ...base,
      type: 'monitor_health',
      incidentId: null,
      status: 'completed',
      result: { ...monitorResult, caveats: [], injected: '<script>alert(1)</script>' },
      failureCode: 'AI_PROVIDER_ERROR',
      completedAt: null,
    }).success).toBe(false);
  });
});
