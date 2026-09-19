import { ApiError } from '../api/http-client';

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';

  switch (error.code) {
    case 'EMAIL_ALREADY_REGISTERED':
      return 'An account with this email already exists.';
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password';
    case 'NETWORK_ERROR':
      return 'Unable to reach Sentinel. Check your connection and try again.';
    case 'VALIDATION_ERROR':
      return 'Review your details and try again.';
    case 'CONFIGURATION_ERROR':
      return 'Sentinel is not configured to reach the API.';
    default:
      return 'Sentinel could not complete the request. Please try again.';
  }
}
