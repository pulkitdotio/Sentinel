import { describe, expect, it } from 'vitest';

import type { CheckResultRecord } from '../../src/modules/checks/check-result-repository';
import {
  calculateRequiredConsensus,
  deriveMonitorHealth,
} from '../../src/modules/incidents/health-engine';

const BASE_TIME = Date.parse('2026-01-01T00:00:00.000Z');

function result(
  region: string,
  sequence: number,
  success: boolean,
  latencyMs = success ? 100 : null,
): CheckResultRecord {
  const scheduledAt = new Date(BASE_TIME + sequence * 60_000);
  return {
    id: String(sequence).padStart(24, '0'),
    userId: '000000000000000000000001',
    monitorId: '000000000000000000000002',
    region,
    scheduledAt,
    startedAt: scheduledAt,
    completedAt: scheduledAt,
    success,
    statusCode: success ? 200 : 503,
    latencyMs,
    errorType: success ? null : 'unexpected_status',
    createdAt: scheduledAt,
  };
}

function evaluate(
  histories: ReadonlyMap<string, readonly CheckResultRecord[]>,
  options: {
    regions?: string[];
    failureThreshold?: number;
    recoveryThreshold?: number;
    latencyThresholdMs?: number;
    isPaused?: boolean;
    hasOpenIncident?: boolean;
  } = {},
) {
  return deriveMonitorHealth({
    regions: options.regions ?? ['mumbai', 'singapore', 'frankfurt'],
    histories,
    failureThreshold: options.failureThreshold ?? 2,
    recoveryThreshold: options.recoveryThreshold ?? 2,
    latencyThresholdMs: options.latencyThresholdMs ?? 500,
    isPaused: options.isPaused ?? false,
    hasOpenIncident: options.hasOpenIncident ?? false,
  });
}

describe('aggregate monitor health derivation', () => {
  it('calculates majority consensus for one through five regions', () => {
    expect([1, 2, 3, 4, 5].map(calculateRequiredConsensus)).toEqual([1, 2, 2, 3, 3]);
  });

  it('remains pending until every configured region has evidence', () => {
    const evaluation = evaluate(
      new Map([
        ['mumbai', [result('mumbai', 1, true)]],
        ['singapore', [result('singapore', 1, true)]],
      ]),
    );

    expect(evaluation.status).toBe('pending');
  });

  it('does not open from a partial initial observation set even if observed regions fail', () => {
    const evaluation = evaluate(
      new Map([
        ['mumbai', [result('mumbai', 2, false), result('mumbai', 1, false)]],
        ['singapore', [result('singapore', 2, false), result('singapore', 1, false)]],
      ]),
    );

    expect(evaluation).toMatchObject({
      status: 'pending',
      shouldOpenIncident: false,
    });
  });

  it('is healthy when every latest result succeeds within the latency threshold', () => {
    const evaluation = evaluate(
      new Map([
        ['mumbai', [result('mumbai', 1, true)]],
        ['singapore', [result('singapore', 1, true)]],
        ['frankfurt', [result('frankfurt', 1, true)]],
      ]),
    );

    expect(evaluation.status).toBe('healthy');
  });

  it('marks one current regional failure out of three as degraded', () => {
    const evaluation = evaluate(
      new Map([
        ['mumbai', [result('mumbai', 1, false)]],
        ['singapore', [result('singapore', 1, true)]],
        ['frankfurt', [result('frankfurt', 1, true)]],
      ]),
    );

    expect(evaluation).toMatchObject({ status: 'degraded', shouldOpenIncident: false });
  });

  it('uses majority consensus for one, two, and three regions', () => {
    const failed = (region: string) => [result(region, 2, false), result(region, 1, false)];

    const oneRegion = evaluate(new Map([['mumbai', failed('mumbai')]]), {
      regions: ['mumbai'],
    });
    const twoRegions = evaluate(
      new Map([
        ['mumbai', failed('mumbai')],
        ['singapore', [result('singapore', 2, true), result('singapore', 1, true)]],
      ]),
      { regions: ['mumbai', 'singapore'] },
    );
    const threeRegions = evaluate(
      new Map([
        ['mumbai', failed('mumbai')],
        ['singapore', failed('singapore')],
        ['frankfurt', [result('frankfurt', 2, true), result('frankfurt', 1, true)]],
      ]),
    );

    expect(oneRegion).toMatchObject({ requiredConsensus: 1, shouldOpenIncident: true });
    expect(twoRegions).toMatchObject({
      requiredConsensus: 2,
      status: 'degraded',
      shouldOpenIncident: false,
    });
    expect(threeRegions).toMatchObject({
      requiredConsensus: 2,
      status: 'down',
      shouldOpenIncident: true,
    });
  });

  it('does not go down when only a minority reaches the failure threshold', () => {
    const evaluation = evaluate(
      new Map([
        ['mumbai', [result('mumbai', 2, false), result('mumbai', 1, false)]],
        ['singapore', [result('singapore', 2, true), result('singapore', 1, true)]],
        ['frankfurt', [result('frankfurt', 2, true), result('frankfurt', 1, true)]],
      ]),
    );

    expect(evaluation).toMatchObject({ status: 'degraded', shouldOpenIncident: false });
  });

  it('does not open below the exact failure threshold and opens at it', () => {
    const oneFailure = [result('mumbai', 3, false), result('mumbai', 2, true)];
    const twoFailures = [result('mumbai', 4, false), result('mumbai', 3, false)];

    expect(
      evaluate(new Map([['mumbai', oneFailure]]), { regions: ['mumbai'] }),
    ).toMatchObject({ status: 'degraded', shouldOpenIncident: false });
    expect(
      evaluate(new Map([['mumbai', twoFailures]]), { regions: ['mumbai'] }),
    ).toMatchObject({ status: 'down', shouldOpenIncident: true });
  });

  it('resets failure and recovery streaks when the opposite outcome appears', () => {
    const evaluation = evaluate(
      new Map([
        [
          'mumbai',
          [
            result('mumbai', 4, false),
            result('mumbai', 3, true),
            result('mumbai', 2, false),
          ],
        ],
      ]),
      { regions: ['mumbai'], failureThreshold: 2, hasOpenIncident: true },
    );

    expect(evaluation.evidence[0]).toMatchObject({
      consecutiveFailures: 1,
      consecutiveSuccesses: 0,
      failureThresholdMet: false,
      recoveryThresholdMet: false,
    });
    expect(evaluation.status).toBe('down');
  });

  it('treats slow successful responses as degraded without opening an incident', () => {
    const evaluation = evaluate(
      new Map([
        ['mumbai', [result('mumbai', 1, true, 501)]],
        ['singapore', [result('singapore', 1, true)]],
        ['frankfurt', [result('frankfurt', 1, true)]],
      ]),
    );

    expect(evaluation).toMatchObject({ status: 'degraded', shouldOpenIncident: false });
    expect(evaluation.evidence[0]?.latencyDegraded).toBe(true);
  });

  it('keeps an open incident down until recovery consensus reaches the threshold', () => {
    const histories = new Map([
      ['mumbai', [result('mumbai', 3, true), result('mumbai', 2, true)]],
      ['singapore', [result('singapore', 3, true), result('singapore', 2, false)]],
      ['frankfurt', [result('frankfurt', 3, false), result('frankfurt', 2, false)]],
    ]);
    const evaluation = evaluate(histories, { hasOpenIncident: true });

    expect(evaluation).toMatchObject({
      status: 'down',
      shouldResolveIncident: false,
    });
  });

  it('resolves at exact recovery consensus and derives a degraded post-resolution state', () => {
    const histories = new Map([
      ['mumbai', [result('mumbai', 4, true), result('mumbai', 3, true)]],
      ['singapore', [result('singapore', 4, true), result('singapore', 3, true)]],
      ['frankfurt', [result('frankfurt', 4, false), result('frankfurt', 3, false)]],
    ]);
    const evaluation = evaluate(histories, { hasOpenIncident: true });

    expect(evaluation).toMatchObject({
      status: 'degraded',
      shouldResolveIncident: true,
    });
  });

  it('becomes healthy after full recovery', () => {
    const histories = new Map([
      ['mumbai', [result('mumbai', 4, true), result('mumbai', 3, true)]],
      ['singapore', [result('singapore', 4, true), result('singapore', 3, true)]],
      ['frankfurt', [result('frankfurt', 4, true), result('frankfurt', 3, true)]],
    ]);

    expect(evaluate(histories, { hasOpenIncident: true })).toMatchObject({
      status: 'healthy',
      shouldResolveIncident: true,
    });
  });

  it('preserves paused status without incident transitions', () => {
    const evaluation = evaluate(new Map(), { isPaused: true });

    expect(evaluation).toMatchObject({
      status: 'paused',
      shouldOpenIncident: false,
      shouldResolveIncident: false,
    });
  });

  it('is deterministic for out-of-order history input', () => {
    const latest = result('mumbai', 3, false);
    const earlier = result('mumbai', 2, false);
    const ordered = [latest, earlier];
    const outOfOrder = [earlier, latest];

    const first = evaluate(new Map([['mumbai', ordered]]), { regions: ['mumbai'] });
    const second = evaluate(new Map([['mumbai', outOfOrder]]), { regions: ['mumbai'] });

    expect(second).toEqual(first);
  });

  it('converges to the same aggregate result for different regional cycle arrival orders', () => {
    const finalHistories = [
      ['mumbai', [result('mumbai', 2, false), result('mumbai', 1, false)]],
      ['singapore', [result('singapore', 2, false), result('singapore', 1, false)]],
      ['frankfurt', [result('frankfurt', 2, true), result('frankfurt', 1, true)]],
    ] as const;
    const forward = evaluate(new Map(finalHistories));
    const reverse = evaluate(new Map([...finalHistories].reverse()));

    expect(forward).toMatchObject({ status: 'down', shouldOpenIncident: true });
    expect(reverse).toEqual(forward);
  });
});
