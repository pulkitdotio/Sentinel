import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { authApi } from '../api/auth-api';
import type {
  AuthenticationResponse,
  LoginRequest,
  RegisterRequest,
} from '../api/contracts';
import { ApiError } from '../api/http-client';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  subscribeToAuthToken,
} from './auth-token';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

const AUTH_QUERY_KEY = ['auth', 'me'] as const;

function isRejectedToken(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    (error.code === 'INVALID_TOKEN' || error.code === 'AUTHENTICATION_REQUIRED')
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const token = useSyncExternalStore(subscribeToAuthToken, getAuthToken, () => null);
  const sessionQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (error: unknown) {
        if (isRejectedToken(error)) clearAuthToken();
        throw error;
      }
    },
    enabled: token !== null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (token === null) queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
  }, [queryClient, token]);

  const establishSession = useCallback(
    (result: AuthenticationResponse) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, result.user);
      setAuthToken(result.token);
    },
    [queryClient],
  );

  const login = useCallback(
    async (input: LoginRequest) => {
      establishSession(await authApi.login(input));
    },
    [establishSession],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      establishSession(await authApi.register(input));
    },
    [establishSession],
  );

  const logout = useCallback(async () => {
    clearAuthToken();
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  const retrySession = useCallback(async () => {
    await sessionQuery.refetch();
  }, [sessionQuery]);

  const status: AuthStatus =
    token === null
      ? 'unauthenticated'
      : sessionQuery.isSuccess
        ? 'authenticated'
        : 'checking';

  const value = useMemo<AuthContextValue>(
    () => ({
      login,
      logout,
      register,
      retrySession,
      sessionError: sessionQuery.error instanceof ApiError ? sessionQuery.error : null,
      status,
      user: status === 'authenticated' ? (sessionQuery.data ?? null) : null,
    }),
    [login, logout, register, retrySession, sessionQuery.data, sessionQuery.error, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
