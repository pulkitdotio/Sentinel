import { AppError } from '../../shared/errors/app-error';
import type { MonitorRecord } from '../monitors/monitor-repository';
import type {
  IncidentRecord,
  IncidentRepository,
} from './incident-repository';
import type { IncidentPagination } from './incident.schemas';

export interface MonitorOwnershipRepository {
  findOwnedById(userId: string, monitorId: string): Promise<MonitorRecord | null>;
}

export interface SafeIncident {
  id: string;
  userId: string;
  monitorId: string;
  status: 'open' | 'resolved';
  openedAt: string;
  resolvedAt: string | null;
  triggerReason: string;
  openingStatusEvidence: {
    requiredConsensus: number;
    failureThreshold: number;
    regions: Array<{
      region: string;
      consecutiveFailures: number;
      latestErrorType: string | null;
    }>;
  };
  events: Array<{
    type: 'opened' | 'resolved';
    at: string;
    message: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SafeIncidentPage {
  incidents: SafeIncident[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function toSafeIncident(incident: IncidentRecord): SafeIncident {
  return {
    id: incident.id,
    userId: incident.userId,
    monitorId: incident.monitorId,
    status: incident.status,
    openedAt: incident.openedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    triggerReason: incident.triggerReason,
    openingStatusEvidence: {
      requiredConsensus: incident.openingStatusEvidence.requiredConsensus,
      failureThreshold: incident.openingStatusEvidence.failureThreshold,
      regions: incident.openingStatusEvidence.regions.map((region) => ({ ...region })),
    },
    events: incident.events.map((event) => ({
      type: event.type,
      at: event.at.toISOString(),
      message: event.message,
    })),
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}

export class IncidentService {
  public constructor(
    private readonly incidentRepository: IncidentRepository,
    private readonly monitorRepository: MonitorOwnershipRepository,
  ) {}

  public async listForMonitor(
    userId: string,
    monitorId: string,
    pagination: IncidentPagination,
  ): Promise<SafeIncidentPage> {
    const monitor = await this.monitorRepository.findOwnedById(userId, monitorId);

    if (!monitor) {
      throw new AppError(404, 'MONITOR_NOT_FOUND', 'Monitor not found');
    }

    const page = await this.incidentRepository.listOwnedByMonitor(
      userId,
      monitorId,
      (pagination.page - 1) * pagination.limit,
      pagination.limit,
    );

    return {
      incidents: page.incidents.map(toSafeIncident),
      pagination: {
        ...pagination,
        total: page.total,
        totalPages: Math.ceil(page.total / pagination.limit),
      },
    };
  }

  public async get(userId: string, incidentId: string): Promise<SafeIncident> {
    const incident = await this.incidentRepository.findOwnedById(userId, incidentId);

    if (!incident) {
      throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    }

    return toSafeIncident(incident);
  }
}
