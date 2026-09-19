import { createContext, useContext } from 'react';

import type { LoginRequest, RegisterRequest, User } from '../api/contracts';
import type { ApiError } from '../api/http-client';

export type AuthStatus = 'authenticated' | 'checking' | 'unauthenticated';

export interface AuthContextValue {
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  retrySession: () => Promise<void>;
  sessionError: ApiError | null;
  status: AuthStatus;
  user: User | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
