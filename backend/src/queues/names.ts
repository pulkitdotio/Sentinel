import { regionIdentifierSchema } from '../shared/schemas/region';

export { regionIdentifierSchema } from '../shared/schemas/region';

export const INCIDENT_EVALUATION_QUEUE_NAME = 'incident-evaluation';
export const AI_ANALYSIS_QUEUE_NAME = 'ai-analysis';

export function probeQueueName(region: string): string {
  return `probe-${regionIdentifierSchema.parse(region)}`;
}
