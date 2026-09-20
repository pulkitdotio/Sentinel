export const aiAnalysisKeys = {
  all: ['ai-analyses'] as const,
  detail: (analysisId: string) => [...aiAnalysisKeys.all, 'detail', analysisId] as const,
};

