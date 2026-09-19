import type { Logger } from 'pino';

import type { AiAnalysisJobPayload } from '../queues/jobs/ai-analysis';
import {
  aiAnalysisJobPayloadSchema,
} from '../queues/jobs/ai-analysis';
import {
  aiAnalysisCompletedEventId,
  aiAnalysisFailedEventId,
  type RealtimeDomainEvent,
} from '../realtime/events';
import {
  NOOP_REALTIME_EVENT_PUBLISHER,
  type RealtimeEventPublisher,
} from '../realtime/publisher';
import type {
  AiAnalysisRecord,
  AiAnalysisRepository,
} from '../modules/ai/ai-analysis-repository';
import { AiContextError, type AiContextBuilder } from '../modules/ai/ai-context';
import {
  incidentAiResultSchema,
  monitorHealthAiResultSchema,
  type AiAnalysisResult,
  type AiFailureCode,
} from '../modules/ai/ai-contracts';
import {
  AiProviderError,
  type AiProvider,
} from '../modules/ai/ai-provider';

export class PermanentAiJobError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PermanentAiJobError';
  }
}

export interface AiRetryContext {
  attemptsMade: number;
  maxAttempts: number;
}

export type AiProcessingOutcome =
  | { status: 'completed'; analysisId: string }
  | { status: 'noop'; analysisId: string; analysisStatus: 'completed' | 'failed' };

interface ClassifiedFailure {
  code: AiFailureCode;
  retryable: boolean;
}

function classifyFailure(error: unknown): ClassifiedFailure {
  if (error instanceof AiProviderError) {
    return { code: error.code, retryable: error.retryable };
  }

  if (error instanceof AiContextError) {
    return { code: error.code, retryable: false };
  }

  return { code: 'AI_PROVIDER_ERROR', retryable: true };
}

function resourceFor(analysis: AiAnalysisRecord): {
  resourceType: 'monitor' | 'incident';
  resourceId: string;
} {
  if (analysis.type === 'monitor_health' && analysis.monitorId) {
    return { resourceType: 'monitor', resourceId: analysis.monitorId };
  }

  if (analysis.type === 'incident_summary' && analysis.incidentId) {
    return { resourceType: 'incident', resourceId: analysis.incidentId };
  }

  throw new AiContextError('AI_CONTEXT_UNAVAILABLE');
}

export class AiAnalysisProcessor {
  public constructor(
    private readonly analysisRepository: AiAnalysisRepository,
    private readonly contextBuilder: AiContextBuilder,
    private readonly provider: AiProvider,
    private readonly logger: Logger,
    private readonly realtimePublisher: RealtimeEventPublisher = NOOP_REALTIME_EVENT_PUBLISHER,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async process(
    input: unknown,
    retry: AiRetryContext,
  ): Promise<AiProcessingOutcome> {
    const parsedPayload = aiAnalysisJobPayloadSchema.safeParse(input);

    if (!parsedPayload.success) {
      throw new PermanentAiJobError('AI analysis job payload is invalid');
    }

    const payload: AiAnalysisJobPayload = parsedPayload.data;
    const existing = await this.analysisRepository.findById(payload.analysisId);

    if (!existing) {
      throw new PermanentAiJobError('AI analysis does not exist');
    }

    if (existing.status === 'completed' || existing.status === 'failed') {
      return {
        status: 'noop',
        analysisId: existing.id,
        analysisStatus: existing.status,
      };
    }

    const analysis = await this.analysisRepository.markProcessing(existing.id);

    if (!analysis) {
      const current = await this.analysisRepository.findById(existing.id);

      if (current?.status === 'completed' || current?.status === 'failed') {
        return {
          status: 'noop',
          analysisId: current.id,
          analysisStatus: current.status,
        };
      }

      throw new Error('AI analysis could not transition to processing');
    }

    try {
      const result = await this.analyze(analysis);
      const completed = await this.analysisRepository.completeIfProcessing(
        analysis.id,
        result,
        this.clock(),
      );

      if (!completed) {
        const current = await this.analysisRepository.findById(analysis.id);

        if (current?.status === 'completed' || current?.status === 'failed') {
          return {
            status: 'noop',
            analysisId: current.id,
            analysisStatus: current.status,
          };
        }

        throw new Error('AI analysis could not transition to completed');
      }

      await this.publishBestEffort(this.completedEvent(completed));
      return { status: 'completed', analysisId: completed.id };
    } catch (error: unknown) {
      const failure = classifyFailure(error);
      const hasRetryRemaining = retry.attemptsMade + 1 < retry.maxAttempts;

      if (failure.retryable && hasRetryRemaining) {
        throw error;
      }

      const failed = await this.analysisRepository.failIfActive(
        analysis.id,
        failure.code,
        this.clock(),
      );

      if (failed) {
        await this.publishBestEffort(this.failedEvent(failed, failure.code));
      }

      throw new PermanentAiJobError(failure.code);
    }
  }

  private async analyze(analysis: AiAnalysisRecord): Promise<AiAnalysisResult> {
    if (analysis.type === 'monitor_health') {
      const context = await this.contextBuilder.buildMonitorHealth(analysis);
      const result = await this.provider.analyzeMonitorHealth(context);
      const validated = monitorHealthAiResultSchema.safeParse(result);

      if (!validated.success) {
        throw new AiProviderError('AI_INVALID_OUTPUT', false);
      }

      return validated.data;
    }

    const context = await this.contextBuilder.buildIncidentSummary(analysis);
    const result = await this.provider.summarizeIncident(context);
    const validated = incidentAiResultSchema.safeParse(result);

    if (!validated.success) {
      throw new AiProviderError('AI_INVALID_OUTPUT', false);
    }

    return validated.data;
  }

  private completedEvent(analysis: AiAnalysisRecord): RealtimeDomainEvent {
    const resource = resourceFor(analysis);
    return {
      version: 1,
      eventId: aiAnalysisCompletedEventId(analysis.id),
      userId: analysis.userId,
      type: 'ai.analysis.completed',
      occurredAt: this.clock().toISOString(),
      payload: { analysisId: analysis.id, ...resource },
    };
  }

  private failedEvent(
    analysis: AiAnalysisRecord,
    failureCode: AiFailureCode,
  ): RealtimeDomainEvent {
    const resource = resourceFor(analysis);
    return {
      version: 1,
      eventId: aiAnalysisFailedEventId(analysis.id),
      userId: analysis.userId,
      type: 'ai.analysis.failed',
      occurredAt: this.clock().toISOString(),
      payload: { analysisId: analysis.id, ...resource, failureCode },
    };
  }

  private async publishBestEffort(event: RealtimeDomainEvent): Promise<void> {
    try {
      await this.realtimePublisher.publish(event);
    } catch (error: unknown) {
      this.logger.warn(
        { err: error, eventId: event.eventId, eventType: event.type },
        'Failed to publish AI realtime event',
      );
    }
  }
}
