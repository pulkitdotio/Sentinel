import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { AuthLayout } from '../components/auth/AuthLayout';
import { SessionGate } from '../components/auth/SessionGate';
import { AppPlaceholderPage } from '../pages/AppPlaceholderPage';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RegisterPage } from '../pages/RegisterPage';

function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function GuestOnlyRoute() {
  const { status } = useAuth();
  return status === 'authenticated' ? <Navigate to="/app" replace /> : <Outlet />;
}

export function AppRoutes() {
  const { status } = useAuth();
  if (status === 'checking') return <SessionGate />;

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<GuestOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppPlaceholderPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
