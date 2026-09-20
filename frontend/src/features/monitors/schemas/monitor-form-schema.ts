import { z } from 'zod';

import {
  MONITOR_METHODS,
  MONITOR_REGIONS,
  type Monitor,
  type MonitorConfiguration,
} from '../api/monitor-contracts';

export const MONITOR_LIMITS = {
  nameLength: 100,
  urlLength: 2_048,
  intervalSeconds: { min: 10, max: 86_400 },
  timeoutMs: { min: 100, max: 30_000 },
  expectedStatusCodes: { min: 1, max: 20, lowest: 100, highest: 599 },
  latencyThresholdMs: { min: 1, max: 60_000 },
  consecutiveThreshold: { min: 1, max: 10 },
} as const;

interface StatusCodeParseSuccess {
  success: true;
  values: number[];
}

interface StatusCodeParseFailure {
  success: false;
  message: string;
}

export function parseExpectedStatusCodes(value: string): StatusCodeParseSuccess | StatusCodeParseFailure {
  const tokens = value.split(',').map((token) => token.trim());
  if (tokens.length === 0 || tokens.some((token) => token.length === 0)) {
    return { success: false, message: 'Enter one or more comma-separated status codes' };
  }

  const values = tokens.map(Number);
  if (values.some((code) => !Number.isInteger(code))) {
    return { success: false, message: 'Status codes must be whole numbers' };
  }
  if (values.length > MONITOR_LIMITS.expectedStatusCodes.max) {
    return { success: false, message: 'Enter no more than 20 status codes' };
  }
  if (values.some((code) => code < 100 || code > 599)) {
    return { success: false, message: 'Status codes must be between 100 and 599' };
  }
  if (new Set(values).size !== values.length) {
    return { success: false, message: 'Status codes must not contain duplicates' };
  }

  return { success: true, values };
}

const monitorUrlSchema = z
  .string()
  .trim()
  .min(1, 'Enter an endpoint URL')
  .max(MONITOR_LIMITS.urlLength, 'URL must be 2,048 characters or fewer')
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Enter a valid absolute URL' });
      return;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      context.addIssue({ code: 'custom', message: 'Use an HTTP or HTTPS URL' });
    }
    if (url.username || url.password) {
      context.addIssue({ code: 'custom', message: 'URL must not include credentials' });
    }
  });

export const monitorFormSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter a monitor name').max(100, 'Name must be 100 characters or fewer'),
  url: monitorUrlSchema,
  method: z.enum(MONITOR_METHODS),
  intervalSeconds: z.number({ error: 'Enter a check interval' }).int('Use a whole number').min(10, 'Interval must be at least 10 seconds').max(86_400, 'Interval must be 86,400 seconds or fewer'),
  timeoutMs: z.number({ error: 'Enter a request timeout' }).int('Use a whole number').min(100, 'Timeout must be at least 100 ms').max(30_000, 'Timeout must be 30,000 ms or fewer'),
  expectedStatusCodes: z.string().trim().superRefine((value, context) => {
    const parsed = parseExpectedStatusCodes(value);
    if (!parsed.success) context.addIssue({ code: 'custom', message: parsed.message });
  }),
  latencyThresholdMs: z.number({ error: 'Enter a latency threshold' }).int('Use a whole number').min(1, 'Latency threshold must be at least 1 ms').max(60_000, 'Latency threshold must be 60,000 ms or fewer'),
  failureThreshold: z.number({ error: 'Enter a failure threshold' }).int('Use a whole number').min(1, 'Failure threshold must be at least 1').max(10, 'Failure threshold must be 10 or fewer'),
  recoveryThreshold: z.number({ error: 'Enter a recovery threshold' }).int('Use a whole number').min(1, 'Recovery threshold must be at least 1').max(10, 'Recovery threshold must be 10 or fewer'),
  regions: z.array(z.enum(MONITOR_REGIONS)).min(1, 'Select at least one region'),
});

export type MonitorFormValues = z.infer<typeof monitorFormSchema>;

export const defaultMonitorFormValues: MonitorFormValues = {
  name: '',
  url: '',
  method: 'GET',
  intervalSeconds: 60,
  timeoutMs: 5_000,
  expectedStatusCodes: '200',
  latencyThresholdMs: 800,
  failureThreshold: 3,
  recoveryThreshold: 2,
  regions: [...MONITOR_REGIONS],
};

export function monitorToFormValues(monitor: Monitor): MonitorFormValues {
  return {
    name: monitor.name,
    url: monitor.url,
    method: monitor.method,
    intervalSeconds: monitor.intervalSeconds,
    timeoutMs: monitor.timeoutMs,
    expectedStatusCodes: monitor.expectedStatusCodes.join(', '),
    latencyThresholdMs: monitor.latencyThresholdMs,
    failureThreshold: monitor.failureThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
    regions: monitor.regions.filter((region): region is (typeof MONITOR_REGIONS)[number] =>
      MONITOR_REGIONS.some((supportedRegion) => supportedRegion === region),
    ),
  };
}

export function formValuesToMonitorConfiguration(values: MonitorFormValues): MonitorConfiguration {
  const statusCodes = parseExpectedStatusCodes(values.expectedStatusCodes);
  if (!statusCodes.success) throw new Error(statusCodes.message);

  return {
    name: values.name.trim(),
    url: new URL(values.url.trim()).toString(),
    method: values.method,
    intervalSeconds: values.intervalSeconds,
    timeoutMs: values.timeoutMs,
    expectedStatusCodes: statusCodes.values,
    latencyThresholdMs: values.latencyThresholdMs,
    failureThreshold: values.failureThreshold,
    recoveryThreshold: values.recoveryThreshold,
    regions: values.regions,
  };
}
