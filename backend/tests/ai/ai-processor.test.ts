import pino from 'pino';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type {
  AiAnalysisRecord,
  AiAnalysisRepository,
} from '../../src/modules/ai/ai-analysis-repository';
import { AiContextError, type AiContextBuilder } from '../../src/modules/ai/ai-context';
import type {
  AiAnalysisResult,
  AiFailureCode,
  IncidentAiResult,
  MonitorHealthAiResult,
} from '../../src/modules/ai/ai-contracts';
import { AiProviderError, type AiProvider } from '../../src/modules/ai/ai-provider';
import type { RealtimeDomainEvent } from '../../src/realtime/events';
import type { RealtimeEventPublisher } from '../../src/realtime/publisher';
import {
  AiAnalysisProcessor,
  PermanentAiJobError,
} from '../../src/workers/ai-analysis-processor';

const USER_ID = '000000000000000000000001';
const MONITOR_ID = '000000000000000000000002';
const INCIDENT_ID = '000000000000000000000003';
const ANALYSIS_ID = '000000000000000000000004';
const NOW = new Date('2026-09-19T12:00:00.000Z');

const monitorResult: MonitorHealthAiResult = {
  summary: 'Healthy overall.',
  observations: ['Most checks succeeded.'],
  regionalFindings: [],
  latencyFindings: [],
  reliabilityRisk: 'low',
  caveats: ['The analysis covers only the supplied window.'],
};

const incidentResult: IncidentAiResult = {
  summary: 'A short incident occurred.',
  timelineSummary: 'Failure evidence was followed by recovery.',
  affectedRegions: ['mumbai'],
  likelyPattern: 'A timeout pattern is possible.',
  evidence: ['Timeouts were observed.'],
  caveats: ['The root cause is not confirmed.'],
};

function record(type: 'monitor_health' | 'incident_summary' = 'monitor_health'): AiAnalysisRecord {
  return {
    id: ANALYSIS_ID,
    userId: USER_ID,
    type,
    monitorId: MONITOR_ID,
    incidentId: type === 'incident_summary' ? INCIDENT_ID : null,
    status: 'queued',
    inputWindow: { from: new Date(NOW.getTime() - 3_600_000), to: NOW },
    result: null,
    failureCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
  };
}

class MemoryRepository implements AiAnalysisRepository {
  public current: AiAnalysisRecord | null = record();

  public createQueued(): Promise<AiAnalysisRecord> {
    throw new Error('not used');
  }

  public findById(): Promise<AiAnalysisRecord | null> {
    return Promise.resolve(this.current);
  }

  public findOwnedById(): Promise<AiAnalysisRecord | null> {
    return Promise.resolve(this.current);
  }

  public markProcessing(): Promise<AiAnalysisRecord | null> {
    if (!this.current || !['queued', 'processing'].includes(this.current.status)) {
      return Promise.resolve(null);
    }
    this.current = { ...this.current, status: 'processing' };
    return Promise.resolve(this.current);
  }

  public completeIfProcessing(
    _analysisId: string,
    result: AiAnalysisResult,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null> {
    if (this.current?.status !== 'processing') {
      return Promise.resolve(null);
    }
    this.current = {
      ...this.current,
      status: 'completed',
      result,
      failureCode: null,
      completedAt,
    };
    return Promise.resolve(this.current);
  }

  public failIfActive(
    _analysisId: string,
    failureCode: AiFailureCode,
    completedAt: Date,
  ): Promise<AiAnalysisRecord | null> {
    if (!this.current || !['queued', 'processing'].includes(this.current.status)) {
      return Promise.resolve(null);
    }
    this.current = {
      ...this.current,
      status: 'failed',
      result: null,
      failureCode,
      completedAt,
    };
    return Promise.resolve(this.current);
  }
}

class RecordingRealtimePublisher implements RealtimeEventPublisher {
  public events: RealtimeDomainEvent[] = [];
  public shouldFail = false;

  public publish(event: RealtimeDomainEvent): Promise<void> {
    this.events.push(event);
    return this.shouldFail
      ? Promise.reject(new Error('redis pubsub unavailable'))
      : Promise.resolve();
  }
}

describe('AI analysis processor', () => {
  let repository: MemoryRepository;
  let realtime: RecordingRealtimePublisher;
  let provider: AiProvider;
  let analyzeMonitorHealth: Mock<AiProvider['analyzeMonitorHealth']>;
  let summarizeIncident: Mock<AiProvider['summarizeIncident']>;
  let contextBuilder: AiContextBuilder;

  function processor(): AiAnalysisProcessor {
    return new AiAnalysisProcessor(
      repository,
      contextBuilder,
      provider,
      pino({ enabled: false }),
      realtime,
      () => NOW,
    );
  }

  beforeEach(() => {
    repository = new MemoryRepository();
    realtime = new RecordingRealtimePublisher();
    analyzeMonitorHealth = vi
      .fn<AiProvider['analyzeMonitorHealth']>()
      .mockResolvedValue(monitorResult);
    summarizeIncident = vi
      .fn<AiProvider['summarizeIncident']>()
      .mockResolvedValue(incidentResult);
    provider = { analyzeMonitorHealth, summarizeIncident };
    contextBuilder = {
      buildMonitorHealth: vi.fn().mockResolvedValue({ evidence: {} }),
      buildIncidentSummary: vi.fn().mockResolvedValue({ evidence: {} }),
    } as unknown as AiContextBuilder;
  });

  it('rejects malformed job payloads permanently before repository access', async () => {
    await expect(
      processor().process(
        { analysisId: 'not-an-object-id' },
        { attemptsMade: 0, maxAttempts: 2 },
      ),
    ).rejects.toThrow(PermanentAiJobError);
    expect(repository.current?.status).toBe('queued');
    expect(analyzeMonitorHealth).not.toHaveBeenCalled();
  });

  it('transitions queued to processing to completed and publishes after durable storage', async () => {
    const outcome = await processor().process(
      { analysisId: ANALYSIS_ID },
      { attemptsMade: 0, maxAttempts: 2 },
    );

    expect(outcome).toEqual({ status: 'completed', analysisId: ANALYSIS_ID });
    expect(repository.current).toMatchObject({ status: 'completed', result: monitorResult });
    expect(realtime.events).toEqual([
      expect.objectContaining({
        eventId: `ai-completed-${ANALYSIS_ID}`,
        userId: USER_ID,
        type: 'ai.analysis.completed',
        payload: {
          analysisId: ANALYSIS_ID,
          resourceType: 'monitor',
          resourceId: MONITOR_ID,
        },
      }),
    ]);
  });

  it('processes a resolved incident through the incident provider method', async () => {
    repository.current = record('incident_summary');

    await processor().process(
      { analysisId: ANALYSIS_ID },
      { attemptsMade: 0, maxAttempts: 2 },
    );

    expect(summarizeIncident).toHaveBeenCalledOnce();
    expect(analyzeMonitorHealth).not.toHaveBeenCalled();
    expect(repository.current).toMatchObject({ status: 'completed', result: incidentResult });
    expect(realtime.events[0]).toMatchObject({
      type: 'ai.analysis.completed',
      payload: { resourceType: 'incident', resourceId: INCIDENT_ID },
    });
  });

  it('leaves processing state for a retryable first failure and fails on the final attempt', async () => {
    analyzeMonitorHealth.mockRejectedValue(
      new AiProviderError('AI_PROVIDER_TIMEOUT', true),
    );
    const subject = processor();

    await expect(
      subject.process(
        { analysisId: ANALYSIS_ID },
        { attemptsMade: 0, maxAttempts: 2 },
      ),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_TIMEOUT' });
    expect(repository.current).toMatchObject({ status: 'processing', failureCode: null });
    expect(realtime.events).toEqual([]);

    await expect(
      subject.process(
        { analysisId: ANALYSIS_ID },
        { attemptsMade: 1, maxAttempts: 2 },
      ),
    ).rejects.toBeInstanceOf(PermanentAiJobError);
    expect(repository.current).toMatchObject({
      status: 'failed',
      failureCode: 'AI_PROVIDER_TIMEOUT',
    });
    expect(realtime.events[0]).toMatchObject({
      eventId: `ai-failed-${ANALYSIS_ID}`,
      type: 'ai.analysis.failed',
      payload: {
        analysisId: ANALYSIS_ID,
        resourceType: 'monitor',
        resourceId: MONITOR_ID,
        failureCode: 'AI_PROVIDER_TIMEOUT',
      },
    });
    expect(JSON.stringify(realtime.events[0])).not.toContain('provider');
  });

  it('rejects malformed output permanently without storing it or consuming a retry', async () => {
    analyzeMonitorHealth.mockResolvedValue({
      ...monitorResult,
      caveats: [],
    });

    await expect(
      processor().process(
        { analysisId: ANALYSIS_ID },
        { attemptsMade: 0, maxAttempts: 2 },
      ),
    ).rejects.toBeInstanceOf(PermanentAiJobError);
    expect(repository.current).toMatchObject({
      status: 'failed',
      result: null,
      failureCode: 'AI_INVALID_OUTPUT',
    });
    expect(analyzeMonitorHealth).toHaveBeenCalledOnce();
  });

  it('marks deleted or invalid processing targets safely without calling the provider', async () => {
    contextBuilder = {
      buildMonitorHealth: vi.fn().mockRejectedValue(new AiContextError('AI_RESOURCE_NOT_FOUND')),
      buildIncidentSummary: vi.fn(),
    } as unknown as AiContextBuilder;

    await expect(
      processor().process(
        { analysisId: ANALYSIS_ID },
        { attemptsMade: 0, maxAttempts: 2 },
      ),
    ).rejects.toBeInstanceOf(PermanentAiJobError);
    expect(repository.current).toMatchObject({
      status: 'failed',
      failureCode: 'AI_RESOURCE_NOT_FOUND',
    });
    expect(analyzeMonitorHealth).not.toHaveBeenCalled();
  });

  it.each(['completed', 'failed'] as const)(
    'treats a replay of terminal %s analysis as a no-op',
    async (status) => {
      repository.current = {
        ...record(),
        status,
        result: status === 'completed' ? monitorResult : null,
        failureCode: status === 'failed' ? 'AI_PROVIDER_ERROR' : null,
      };

      await expect(
        processor().process(
          { analysisId: ANALYSIS_ID },
          { attemptsMade: 0, maxAttempts: 2 },
        ),
      ).resolves.toEqual({ status: 'noop', analysisId: ANALYSIS_ID, analysisStatus: status });
      expect(analyzeMonitorHealth).not.toHaveBeenCalled();
      expect(realtime.events).toEqual([]);
    },
  );

  it('does not roll back a completed analysis when realtime publication fails', async () => {
    realtime.shouldFail = true;

    await expect(
      processor().process(
        { analysisId: ANALYSIS_ID },
        { attemptsMade: 0, maxAttempts: 2 },
      ),
    ).resolves.toMatchObject({ status: 'completed' });
    expect(repository.current).toMatchObject({ status: 'completed', result: monitorResult });
  });
});
