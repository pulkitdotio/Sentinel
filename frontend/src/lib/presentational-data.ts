/**
 * Static marketing-only preview data.
 * This module never represents connected backend or realtime application state.
 */
export const regionalChecks = [
  { city: 'Mumbai', code: 'bom', latency: '142 ms', status: 'healthy' as const },
  { city: 'Singapore', code: 'sin', latency: '187 ms', status: 'healthy' as const },
  { city: 'Frankfurt', code: 'fra', latency: '165 ms', status: 'healthy' as const },
];

export const incidentSteps = [
  { label: 'Regional failures detected', detail: '2 of 3 probes report failure' },
  { label: 'Failure threshold reached', detail: '3 consecutive evaluation cycles' },
  { label: 'Incident opened', detail: 'Deterministic consensus established' },
  { label: 'Recovery consensus reached', detail: '2 consecutive healthy cycles' },
  { label: 'Incident resolved', detail: 'Timeline preserved for review' },
];

export const latencyPoints = [34, 38, 35, 41, 40, 46, 43, 49, 45, 52, 50, 55, 53, 61, 58, 64];
