import { describe, expect, it } from 'vitest';

import {
  EnvironmentValidationError,
  parseEnvironment,
} from '../../src/config/env';
import { validEnvironmentInput } from '../helpers/environment';

describe('environment configuration', () => {
  it('parses and converts a valid environment', () => {
    const environment = parseEnvironment(validEnvironmentInput);

    expect(environment.PORT).toBe(4000);
    expect(environment.ALLOW_PRIVATE_NETWORK_TARGETS).toBe(false);
    expect(environment.ENABLED_REGIONS).toEqual(['mumbai', 'singapore', 'frankfurt']);
  });

  it('fails clearly when a required value is missing', () => {
    const input = { ...validEnvironmentInput };
    delete input.MONGODB_URI;

    expect(() => parseEnvironment(input)).toThrow(EnvironmentValidationError);
    expect(() => parseEnvironment(input)).toThrow(/MONGODB_URI/);
  });

  it('rejects a probe region that is not enabled', () => {
    const input = { ...validEnvironmentInput, PROBE_REGION: 'sydney' };

    expect(() => parseEnvironment(input)).toThrow(/PROBE_REGION/);
  });

  it('rejects ambiguous boolean values', () => {
    const input = { ...validEnvironmentInput, AI_ENABLED: 'yes' };

    expect(() => parseEnvironment(input)).toThrow(/AI_ENABLED/);
  });
});
