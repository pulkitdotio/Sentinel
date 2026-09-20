import { describe, expect, it } from 'vitest';

import { analysisPollingInterval } from './use-ai-analysis';

describe('AI analysis polling policy', () => {
  it.each(['queued', 'processing'] as const)('polls every 2.5 seconds while %s', (status) => {
    expect(analysisPollingInterval(status)).toBe(2_500);
  });

  it.each(['completed', 'failed'] as const)('stops polling when %s', (status) => {
    expect(analysisPollingInterval(status)).toBe(false);
  });

  it('does not poll without a selected analysis', () => {
    expect(analysisPollingInterval(undefined)).toBe(false);
  });
});
