import type { Logger } from 'pino';

import type { AiAnalysisJobPublisher } from '../../queues/ai-analysis-publisher';
import { AppError } from '../../shared/errors/app-error';
import type { IncidentRepository } from '../incidents/incident-repository';
import type { MonitorRecord } from '../monitors/monitor-repository';
import type {
  AiAnalysisRecord,
  AiAnalysisRepository,
} from './ai-analysis-repository';
import type { AiAnalysisResult } from './ai-contracts';

export interface AiRequestMonitorRepository {
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
}

export interface SafeAiAnalysis {
  id: string;
  type: AiAnalysisRecord['type'];
  monitorId: string | null;
  incidentId: string | null;
  status: AiAnalysisRecord['status'];
  inputWindow: { from: string; to: string };
  result: AiAnalysisResult | null;
  failureCode: AiAnalysisRecord['failureCode'];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

function toSafeAnalysis(analysis: AiAnalysisRecord): SafeAiAnalysis {
  return {
    id: analysis.id,
    type: analysis.type,
    monitorId: analysis.monitorId,
    incidentId: analysis.incidentId,
    status: analysis.status,
    inputWindow: {
      from: analysis.inputWindow.from.toISOString(),
      to: analysis.inputWindow.to.toISOString(),
    },
    result: analysis.result,
    failureCode: analysis.failureCode,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
  };
}

export class AiAnalysisService {
  public constructor(
    private readonly enabled: boolean,
    private readonly analysisRepository: AiAnalysisRepository,
    private readonly monitorRepository: AiRequestMonitorRepository,
    private readonly incidentRepository: Pick<IncidentRepository, 'findOwnedById'>,
    private readonly queuePublisher: AiAnalysisJobPublisher,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async requestMonitorHealth(
    userId: string,
    monitorId: string,
    lookbackHours: number,
  ): Promise<SafeAiAnalysis> {
    this.requireEnabled();
    const monitor = await this.monitorRepository.findOwnedById(userId, monitorId);

    if (!monitor) {
      throw new AppError(404, 'MONITOR_NOT_FOUND', 'Monitor not found');
    }

    const to = this.clock();
    const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1_000);
    const analysis = await this.analysisRepository.createQueued({
      userId,
      type: 'monitor_health',
      monitorId: monitor.id,
      incidentId: null,
      inputWindow: { from, to },
    });
    await this.enqueueOrFail(analysis);
    return toSafeAnalysis(analysis);
  }

  public async requestIncidentSummary(
    userId: string,
    incidentId: string,
  ): Promise<SafeAiAnalysis> {
    this.requireEnabled();
    const incident = await this.incidentRepository.findOwnedById(userId, incidentId);

    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }

    if (incident.status !== 'resolved' || !incident.resolvedAt) {
      throw new AppError(409, 'INCIDENT_NOT_RESOLVED', 'Incident is not resolved');
    }

    const analysis = await this.analysisRepository.createQueued({
      userId,
      type: 'incident_summary',
      monitorId: incident.monitorId,
      incidentId: incident.id,
      inputWindow: { from: incident.openedAt, to: incident.resolvedAt },
    });
    await this.enqueueOrFail(analysis);
    return toSafeAnalysis(analysis);
  }

  public async get(userId: string, analysisId: string): Promise<SafeAiAnalysis> {
    const analysis = await this.analysisRepository.findOwnedById(userId, analysisId);

    if (!analysis) {
      throw new AppError(404, 'AI_ANALYSIS_NOT_FOUND', 'AI analysis not found');
    }

    return toSafeAnalysis(analysis);
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new AppError(503, 'AI_FEATURE_DISABLED', 'AI analysis is disabled');
    }
  }

  private async enqueueOrFail(analysis: AiAnalysisRecord): Promise<void> {
    try {
      await this.queuePublisher.enqueue({ analysisId: analysis.id });
    } catch (error: unknown) {
      await this.analysisRepository.failIfActive(
        analysis.id,
        'AI_QUEUE_PUBLISH_FAILED',
        this.clock(),
      );
      this.logger.error(
        { err: error, analysisId: analysis.id },
        'Failed to enqueue AI analysis job',
      );
      throw new AppError(
        503,
        'AI_QUEUE_PUBLISH_FAILED',
        'AI analysis could not be queued',
      );
    }
  }
}
