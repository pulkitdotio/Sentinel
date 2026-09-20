const errorLabels: Record<string, string> = {
  timeout: 'Timeout',
  dns: 'DNS failure',
  connection: 'Connection failure',
  tls: 'TLS failure',
  unexpected_status: 'Unexpected status',
  blocked_target: 'Target blocked',
  redirect_error: 'Redirect error',
  unknown: 'Unknown error',
};

export function checkErrorLabel(errorType: string | null): string {
  if (errorType === null) return '—';
  return errorLabels[errorType] ?? errorType.replaceAll('_', ' ');
}
