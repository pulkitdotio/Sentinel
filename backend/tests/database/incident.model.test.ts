import { describe, expect, it } from 'vitest';

import { IncidentModel } from '../../src/database/models/incident';

describe('Incident model', () => {
  it('defines incident history and one-open-incident indexes', () => {
    expect(IncidentModel.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ userId: 1, monitorId: 1, openedAt: -1 }, expect.any(Object)],
        [
          { monitorId: 1 },
          expect.objectContaining({
            unique: true,
            partialFilterExpression: { status: 'open' },
          }),
        ],
      ]),
    );
  });

  it('accepts a compact opened incident and bounds its lifecycle timeline', async () => {
    const baseIncident = {
      userId: '000000000000000000000001',
      monitorId: '000000000000000000000002',
      status: 'open',
      openedAt: new Date('2026-01-01T00:00:00.000Z'),
      resolvedAt: null,
      triggerReason: 'regional_failure_consensus',
      openingStatusEvidence: {
        requiredConsensus: 2,
        failureThreshold: 2,
        regions: [
          {
            region: 'mumbai',
            consecutiveFailures: 2,
            latestErrorType: 'timeout',
          },
        ],
      },
      events: [
        {
          type: 'opened',
          at: new Date('2026-01-01T00:00:00.000Z'),
          message: 'opened',
        },
      ],
    };
    const validIncident = new IncidentModel(baseIncident);
    const unboundedIncident = new IncidentModel({
      ...baseIncident,
      events: [
        ...baseIncident.events,
        { ...baseIncident.events[0], type: 'resolved' },
        { ...baseIncident.events[0], type: 'opened' },
      ],
    });

    await expect(validIncident.validate()).resolves.toBeUndefined();
    await expect(unboundedIncident.validate()).rejects.toThrow(
      'must contain one or two meaningful lifecycle events',
    );
  });
});
