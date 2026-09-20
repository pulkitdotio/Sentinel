export const monitorKeys = {
  all: ['monitors'] as const,
  list: () => [...monitorKeys.all, 'list'] as const,
  detail: (monitorId: string) => [...monitorKeys.all, 'detail', monitorId] as const,
};
