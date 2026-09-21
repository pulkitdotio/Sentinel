import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_TOKEN_STORAGE_KEY } from '../auth/auth-token';
import { App } from './App';

const user = {
  id: 'user-1',
  name: 'Pulkit',
  email: 'pulkit@example.com',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openRoute(path: string): void {
  window.history.pushState({}, '', path);
}

function mockSuccessfulSession(): void {
  fetchMock.mockResolvedValue(jsonResponse({ user }));
}

async function completeLogin(): Promise<void> {
  await userEvent.type(await screen.findByLabelText('Email'), 'PULKIT@EXAMPLE.COM ');
  await userEvent.type(screen.getByLabelText('Password'), 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Sentinel authentication routes', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:4000/');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    openRoute('/');
  });

  it('renders the refined landing architecture and current realtime copy', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: /know when your.?api breaks/i })).toBeInTheDocument();
    expect(screen.getByText('One endpoint. Three independent points of view.')).toBeInTheDocument();
    expect(screen.getByText('Live event path · Authenticated Socket.IO delivery')).toBeInTheDocument();
    expect(screen.queryByText(/no socket\.io client is connected/i)).not.toBeInTheDocument();
  });

  it('keeps landing content visible immediately when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    render(<App />);
    expect(await screen.findByRole('heading', { name: /know when your.?api breaks/i })).toBeVisible();

    const revealElements = document.querySelectorAll<HTMLElement>('[data-motion-reveal="true"]');
    expect(revealElements.length).toBeGreaterThan(0);
    revealElements.forEach((element) => {
      expect(element.style.opacity).not.toBe('0');
      expect(element.style.transform).not.toContain('translate');
    });
  });

  it('preserves native landing-page anchor navigation', async () => {
    render(<App />);
    const primaryNavigation = await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(within(primaryNavigation).getByRole('link', { name: 'Product' })).toHaveAttribute('href', '#product');
    expect(within(primaryNavigation).getByRole('link', { name: 'Monitoring' })).toHaveAttribute('href', '#monitoring');
    expect(within(primaryNavigation).getByRole('link', { name: 'Architecture' })).toHaveAttribute('href', '#architecture');
    expect(screen.getByRole('link', { name: /see monitoring/i })).toHaveAttribute('href', '#monitoring');
  });

  it('navigates from the landing sign-in action to /login', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('navigates from Start monitoring to /register', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: /start monitoring/i }));
    expect(await screen.findByRole('heading', { name: 'Create your workspace.' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/register');
  });

  it('validates registration fields against backend bounds', async () => {
    openRoute('/register');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers, normalizes input, persists only the token, and opens /app', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'registered-token', user }, 201));
    openRoute('/register');
    render(<App />);

    await userEvent.type(await screen.findByLabelText('Name'), '  Pulkit  ');
    await userEvent.type(screen.getByLabelText('Email'), 'PULKIT@EXAMPLE.COM ');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('registered-token');
    expect(Object.values(localStorage)).not.toContain('password');

    const rawRequestBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof rawRequestBody !== 'string') throw new Error('Expected a JSON request body');
    const requestBody = JSON.parse(rawRequestBody) as Record<string, string>;
    expect(requestBody).toEqual({ name: 'Pulkit', email: 'pulkit@example.com', password: 'password' });
  });

  it('shows the duplicate-email error without exposing raw details', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      error: {
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists',
        details: [{ internal: 'not rendered' }],
      },
    }, 409));
    openRoute('/register');
    render(<App />);

    await userEvent.type(await screen.findByLabelText('Name'), 'Pulkit');
    await userEvent.type(screen.getByLabelText('Email'), 'pulkit@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
    expect(screen.queryByText(/not rendered/i)).not.toBeInTheDocument();
  });

  it('logs in successfully and restores the intended protected destination', async () => {
    openRoute('/app');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();

    fetchMock.mockResolvedValue(jsonResponse({ token: 'login-token', user }));
    await completeLogin();

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('login-token');
  });

  it('shows the generic invalid-credential error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    }, 401));
    openRoute('/login');
    render(<App />);

    await completeLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('redirects an unauthenticated /app visit to /login', async () => {
    openRoute('/app');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('restores a stored session through /auth/me with a bearer header', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stored-token');
    mockSuccessfulSession();
    openRoute('/app');
    render(<App />);

    expect(screen.getByText('Checking your workspace.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestInput = fetchMock.mock.calls[0]?.[0];
    const requestUrl =
      typeof requestInput === 'string'
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.toString()
          : requestInput?.url;
    expect(requestUrl).toBe('http://localhost:4000/api/v1/auth/me');
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer stored-token');
  });

  it('clears an invalid stored token', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'expired-token');
    fetchMock.mockResolvedValue(jsonResponse({
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired authentication token' },
    }, 401));
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('retains a potentially valid token when /auth/me has a network failure', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'possibly-valid-token');
    fetchMock.mockRejectedValue(new TypeError('network unavailable'));
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'We could not reach Sentinel.' })).toBeInTheDocument();
    expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('possibly-valid-token');
  });

  it('clears an expired session rejected by a normal protected REST request', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'expired-later');
    fetchMock.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user }));
      return Promise.resolve(jsonResponse({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired authentication token' },
      }, 401));
    });
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });

  it('keeps a valid token when a protected resource has a network failure', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'still-valid');
    fetchMock.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/auth/me')) return Promise.resolve(jsonResponse({ user }));
      return Promise.reject(new TypeError('network unavailable'));
    });
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach Sentinel');
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('still-valid');
  });

  it('keeps an unknown authenticated route inside the application shell', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stored-token');
    mockSuccessfulSession();
    openRoute('/app/unknown-view');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'This workspace view does not exist.' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toBeInTheDocument();
  });

  it('moves focus out of desktop navigation when a resize hides it', async () => {
    let mobileListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (query === '(max-width: 920px)' && type === 'change') mobileListener = listener;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stored-token');
    mockSuccessfulSession();
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    const overviewLink = screen.getByRole('link', { name: 'Overview' });
    overviewLink.focus();
    expect(overviewLink).toHaveFocus();

    act(() => mobileListener?.({ matches: true } as MediaQueryListEvent));

    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('moves focus to the first visible drawer link when mobile navigation opens', async () => {
    let isMobile = true;
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: isMobile && query === '(max-width: 920px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stored-token');
    mockSuccessfulSession();
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveFocus();
    isMobile = false;
  });

  it.each(['/login', '/register'])('redirects an authenticated visitor from %s to /app', async (path) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stored-token');
    mockSuccessfulSession();
    openRoute(path);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app');
  });

  it('logs out locally and clears the authenticated state', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stored-token');
    mockSuccessfulSession();
    openRoute('/app');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Monitoring overview' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });

  it('exposes an accessible password visibility control', () => {
    openRoute('/login');
    render(<App />);
    const password = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });
});
