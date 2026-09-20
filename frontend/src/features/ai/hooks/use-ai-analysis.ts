import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { aiApi } from '../api/ai-api';
import type { AiAnalysis } from '../api/ai-contracts';
import { aiAnalysisKeys } from '../api/ai-keys';

const ACTIVE_ANALYSIS_POLL_INTERVAL_MS = 2_500;

export function analysisPollingInterval(status: AiAnalysis['status'] | undefined): number | false {
  return status === 'queued' || status === 'processing'
    ? ACTIVE_ANALYSIS_POLL_INTERVAL_MS
    : false;
}

export function useAiAnalysis(analysisId: string | null) {
  return useQuery({
    queryKey: aiAnalysisKeys.detail(analysisId ?? 'inactive'),
    queryFn: () => {
      if (!analysisId) throw new Error('An analysis id is required');
      return aiApi.getAnalysis(analysisId);
    },
    enabled: analysisId !== null,
    refetchInterval: (query) => analysisPollingInterval(query.state.data?.status),
  });
}

export function useRequestMonitorInsight(monitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lookbackHours: number) => aiApi.requestMonitorInsight(monitorId, lookbackHours),
    onSuccess: (analysis) => {
      queryClient.setQueryData(aiAnalysisKeys.detail(analysis.id), analysis);
    },
  });
}

export function useRequestIncidentSummary(incidentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.requestIncidentSummary(incidentId),
    onSuccess: (analysis) => {
      queryClient.setQueryData(aiAnalysisKeys.detail(analysis.id), analysis);
    },
  });
}
