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

  it('rejects region identifiers that cannot be used in regional queue names', () => {
    const input = {
      ...validEnvironmentInput,
      ENABLED_REGIONS: 'mumbai,invalid:region',
    };

    expect(() => parseEnvironment(input)).toThrow(/ENABLED_REGIONS/);
  });

  it('rejects ambiguous boolean values', () => {
    const input = { ...validEnvironmentInput, AI_ENABLED: 'yes' };

    expect(() => parseEnvironment(input)).toThrow(/AI_ENABLED/);
  });

  it('allows absent OpenAI credentials while AI is disabled', () => {
    const input = { ...validEnvironmentInput };
    delete input.OPENAI_API_KEY;
    delete input.OPENAI_MODEL;
    delete input.AI_REQUEST_TIMEOUT_MS;

    const environment = parseEnvironment(input);

    expect(environment.AI_ENABLED).toBe(false);
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment.OPENAI_MODEL).toBeUndefined();
    expect(environment.AI_REQUEST_TIMEOUT_MS).toBeUndefined();
  });

  it('ignores unusable provider timeout configuration while AI is disabled', () => {
    const environment = parseEnvironment({
      ...validEnvironmentInput,
      AI_REQUEST_TIMEOUT_MS: 'not-a-number',
    });

    expect(environment.AI_ENABLED).toBe(false);
    expect(environment.AI_REQUEST_TIMEOUT_MS).toBeUndefined();
  });

  it('requires non-placeholder provider configuration while AI is enabled', () => {
    const input = { ...validEnvironmentInput, AI_ENABLED: 'true' };

    expect(() => parseEnvironment(input)).toThrow(/OPENAI_API_KEY/);
    expect(() => parseEnvironment(input)).toThrow(/OPENAI_MODEL/);
  });

  it('accepts complete provider configuration while AI is enabled', () => {
    const environment = parseEnvironment({
      ...validEnvironmentInput,
      AI_ENABLED: 'true',
      OPENAI_API_KEY: 'test-key-not-a-placeholder',
      OPENAI_MODEL: 'configured-test-model',
      AI_REQUEST_TIMEOUT_MS: '12345',
    });

    expect(environment).toMatchObject({
      AI_ENABLED: true,
      OPENAI_MODEL: 'configured-test-model',
      AI_REQUEST_TIMEOUT_MS: 12_345,
    });
  });

  it('rejects an invalid JWT expiration duration', () => {
    const input = { ...validEnvironmentInput, JWT_EXPIRES_IN: 'forever' };

    expect(() => parseEnvironment(input)).toThrow(/JWT_EXPIRES_IN/);
  });
});
