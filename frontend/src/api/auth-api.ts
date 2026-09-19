import {
  authenticationResponseSchema,
  currentUserResponseSchema,
  type AuthenticationResponse,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from './contracts';
import { httpClient } from './http-client';

export const authApi = {
  login(input: LoginRequest): Promise<AuthenticationResponse> {
    return httpClient.request('/auth/login', {
      method: 'POST',
      body: {
        email: input.email.trim().toLowerCase(),
        password: input.password,
      },
      responseSchema: authenticationResponseSchema,
    });
  },

  register(input: RegisterRequest): Promise<AuthenticationResponse> {
    return httpClient.request('/auth/register', {
      method: 'POST',
      body: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
      },
      responseSchema: authenticationResponseSchema,
    });
  },

  async me(): Promise<User> {
    const response = await httpClient.request('/auth/me', {
      responseSchema: currentUserResponseSchema,
    });
    return response.user;
  },
};
