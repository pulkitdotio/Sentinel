import { describe, expect, it } from 'vitest';

import { FrontendEnvironmentError, parseFrontendEnvironment } from './environment';

describe('parseFrontendEnvironment', () => {
  it('normalizes trailing slashes and derives the API base URL', () => {
    expect(parseFrontendEnvironment({ VITE_BACKEND_URL: 'https://sentinel.example///' })).toEqual({
      backendUrl: 'https://sentinel.example',
      apiBaseUrl: 'https://sentinel.example/api/v1',
    });
  });

  it('rejects relative and non-http URLs', () => {
    expect(() => parseFrontendEnvironment({ VITE_BACKEND_URL: '/backend' })).toThrow(FrontendEnvironmentError);
    expect(() => parseFrontendEnvironment({ VITE_BACKEND_URL: 'ftp://example.com' })).toThrow('must use http: or https:');
  });
});
