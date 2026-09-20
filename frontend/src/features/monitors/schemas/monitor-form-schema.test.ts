import { describe, expect, it } from 'vitest';

import {
  defaultMonitorFormValues,
  formValuesToMonitorConfiguration,
  monitorFormSchema,
  parseExpectedStatusCodes,
} from './monitor-form-schema';

function values(overrides: Partial<typeof defaultMonitorFormValues> = {}) {
  return {
    ...defaultMonitorFormValues,
    name: 'Production API',
    url: 'https://example.com/health',
    ...overrides,
  };
}

describe('monitor form validation', () => {
  it('requires a name and URL', () => {
    const result = monitorFormSchema.safeParse(values({ name: '', url: '' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
      expect(result.error.flatten().fieldErrors.url).toBeDefined();
    }
  });

  it('rejects invalid and non-HTTP URLs', () => {
    expect(monitorFormSchema.safeParse(values({ url: 'not a URL' })).success).toBe(false);
    expect(monitorFormSchema.safeParse(values({ url: 'ftp://example.com' })).success).toBe(false);
    expect(monitorFormSchema.safeParse(values({ url: 'https://user:pass@example.com' })).success).toBe(false);
  });

  it('matches the backend interval bounds', () => {
    expect(monitorFormSchema.safeParse(values({ intervalSeconds: 9 })).success).toBe(false);
    expect(monitorFormSchema.safeParse(values({ intervalSeconds: 10 })).success).toBe(true);
    expect(monitorFormSchema.safeParse(values({ intervalSeconds: 86_401 })).success).toBe(false);
  });

  it('matches the backend timeout bounds', () => {
    expect(monitorFormSchema.safeParse(values({ timeoutMs: 99 })).success).toBe(false);
    expect(monitorFormSchema.safeParse(values({ timeoutMs: 100 })).success).toBe(true);
    expect(monitorFormSchema.safeParse(values({ timeoutMs: 30_001 })).success).toBe(false);
  });

  it('parses comma-separated expected status codes', () => {
    expect(parseExpectedStatusCodes('200, 201, 204')).toEqual({ success: true, values: [200, 201, 204] });
    expect(formValuesToMonitorConfiguration(values({ url: 'https://example.com/health', expectedStatusCodes: '200, 204' })).expectedStatusCodes).toEqual([200, 204]);
  });

  it('rejects invalid and duplicate status codes', () => {
    expect(parseExpectedStatusCodes('99')).toMatchObject({ success: false });
    expect(parseExpectedStatusCodes('600')).toMatchObject({ success: false });
    expect(parseExpectedStatusCodes('200.5')).toMatchObject({ success: false });
    expect(parseExpectedStatusCodes('200, 200')).toEqual({ success: false, message: 'Status codes must not contain duplicates' });
  });

  it('requires at least one supported region', () => {
    const result = monitorFormSchema.safeParse(values({ regions: [] }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.regions).toContain('Select at least one region');
  });

  it('normalizes the same values the backend normalizes', () => {
    const configuration = formValuesToMonitorConfiguration(values({ name: '  API  ', url: 'https://example.com' }));
    expect(configuration.name).toBe('API');
    expect(configuration.url).toBe('https://example.com/');
  });
});
