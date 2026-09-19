export const AUTH_TOKEN_STORAGE_KEY = 'sentinel.accessToken';

const listeners = new Set<() => void>();

function notifyTokenChanged(): void {
  listeners.forEach((listener) => listener());
}

export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  notifyTokenChanged();
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  notifyTokenChanged();
}

export function subscribeToAuthToken(listener: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_TOKEN_STORAGE_KEY) listener();
  };

  listeners.add(listener);
  window.addEventListener('storage', handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
}
