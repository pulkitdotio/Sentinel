import { ApiError } from '../../api/http-client';

export function monitorErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Sentinel could not complete this request. Try again.';

  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Unable to reach Sentinel. Check your connection and try again.';
    case 'VALIDATION_ERROR':
      return 'Some monitor settings were rejected. Review the form and try again.';
    case 'AUTHENTICATION_REQUIRED':
    case 'INVALID_TOKEN':
      return 'Your session is no longer valid. Sign in again to continue.';
    case 'MONITOR_NOT_FOUND':
      return 'This monitor could not be found.';
    case 'CONFIGURATION_ERROR':
      return 'Sentinel is not configured to reach its API.';
    default:
      return error.status !== null && error.status >= 500
        ? 'Sentinel is temporarily unable to complete this request. Try again.'
        : error.message;
  }
}
