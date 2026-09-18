import { describe, expect, it } from 'vitest';

import {
  realtimeDomainEventSchema,
  type RealtimeDomainEvent,
} from '../../src/realtime/events';

const USER_ID = '000000000000000000000001';
const MONITOR_ID = '000000000000000000000002';
const CHECK_RESULT_ID = '000000000000000000000003';
const INCIDENT_ID = '000000000000000000000004';
const OCCURRED_AT = '2026-01-01T00:00:00.000Z';

const validEvents: RealtimeDomainEvent[] = [
  {
    version: 1,
    eventId: `check:${CHECK_RESULT_ID}`,
    userId: USER_ID,
    type: 'check.completed',
    occurredAt: OCCURRED_AT,
    payload: {
      checkResultId: CHECK_RESULT_ID,
      monitorId: MONITOR_ID,
      region: 'mumbai',
      scheduledAt: OCCURRED_AT,
      success: true,
      statusCode: 200,
      latencyMs: 184,
      errorType: null,
    },
  },
  {
    version: 1,
    eventId: `monitor-status:${MONITOR_ID}:degraded:healthy:1`,
    userId: USER_ID,
    type: 'monitor.status_changed',
    occurredAt: OCCURRED_AT,
    payload: {
      monitorId: MONITOR_ID,
      previousStatus: 'degraded',
      status: 'healthy',
      changedAt: OCCURRED_AT,
    },
  },
  {
    version: 1,
    eventId: `incident-opened:${INCIDENT_ID}`,
    userId: USER_ID,
    type: 'incident.opened',
    occurredAt: OCCURRED_AT,
    payload: {
      incidentId: INCIDENT_ID,
      monitorId: MONITOR_ID,
      status: 'open',
      openedAt: OCCURRED_AT,
      triggerReason: 'regional_failure_consensus',
    },
  },
  {
    version: 1,
    eventId: `incident-resolved:${INCIDENT_ID}`,
    userId: USER_ID,
    type: 'incident.resolved',
    occurredAt: '2026-01-01T00:05:00.000Z',
    payload: {
      incidentId: INCIDENT_ID,
      monitorId: MONITOR_ID,
      status: 'resolved',
      openedAt: OCCURRED_AT,
      resolvedAt: '2026-01-01T00:05:00.000Z',
      durationMs: 300_000,
      triggerReason: 'regional_failure_consensus',
    },
  },
];

describe('realtime domain event contract', () => {
  it.each(validEvents)('accepts a valid $type event', (event) => {
    expect(realtimeDomainEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects unknown event types', () => {
    expect(
      realtimeDomainEventSchema.safeParse({
        ...validEvents[0],
        type: 'ai.analysis.completed',
      }).success,
    ).toBe(false);
  });

  it.each([
    ['envelope user id', { ...validEvents[0], userId: 'not-an-object-id' }],
    [
      'payload resource id',
      {
        ...validEvents[0],
        payload: { ...validEvents[0]?.payload, monitorId: 'not-an-object-id' },
      },
    ],
  ])('rejects a malformed %s', (_name, event) => {
    expect(realtimeDomainEventSchema.safeParse(event).success).toBe(false);
  });

  it.each([
    ['occurrence timestamp', { ...validEvents[0], occurredAt: 'yesterday' }],
    [
      'payload timestamp',
      {
        ...validEvents[0],
        payload: { ...validEvents[0]?.payload, scheduledAt: 'yesterday' },
      },
    ],
  ])('rejects a malformed %s', (_name, event) => {
    expect(realtimeDomainEventSchema.safeParse(event).success).toBe(false);
  });

  it('rejects a payload that does not match its event type', () => {
    expect(
      realtimeDomainEventSchema.safeParse({
        ...validEvents[0],
        payload: validEvents[2]?.payload,
      }).success,
    ).toBe(false);
  });

  it('rejects a status event that does not represent a transition', () => {
    expect(
      realtimeDomainEventSchema.safeParse({
        ...validEvents[1],
        payload: {
          ...validEvents[1]?.payload,
          previousStatus: 'healthy',
          status: 'healthy',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects a negative resolved incident duration', () => {
    expect(
      realtimeDomainEventSchema.safeParse({
        ...validEvents[3],
        payload: { ...validEvents[3]?.payload, durationMs: -1 },
      }).success,
    ).toBe(false);
  });
});
