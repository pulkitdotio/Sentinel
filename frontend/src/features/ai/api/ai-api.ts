import { httpClient } from '../../../api/http-client';
import { aiAnalysisResponseSchema, type AiAnalysis } from './ai-contracts';

export const aiApi = {
  async requestMonitorInsight(monitorId: string, lookbackHours: number): Promise<AiAnalysis> {
    const response = await httpClient.request(`/monitors/${monitorId}/ai-insights`, {
      method: 'POST',
      body: { lookbackHours },
      responseSchema: aiAnalysisResponseSchema,
    });
    return response.analysis;
  },

  async requestIncidentSummary(incidentId: string): Promise<AiAnalysis> {
    const response = await httpClient.request(`/incidents/${incidentId}/ai-summary`, {
      method: 'POST',
      responseSchema: aiAnalysisResponseSchema,
    });
    return response.analysis;
  },

  async getAnalysis(analysisId: string): Promise<AiAnalysis> {
    const response = await httpClient.request(`/ai-analyses/${analysisId}`, {
      responseSchema: aiAnalysisResponseSchema,
    });
    return response.analysis;
  },
};

