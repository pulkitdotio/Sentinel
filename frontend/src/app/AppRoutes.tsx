import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { AuthLayout } from '../components/auth/AuthLayout';
import { SessionGate } from '../components/auth/SessionGate';
import { AppShell } from '../components/app/AppShell';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { IncidentDetailPage } from '../pages/IncidentDetailPage';
import { MonitorChecksPage } from '../pages/MonitorChecksPage';
import { MonitorConfigurationPage } from '../pages/MonitorConfigurationPage';
import { MonitorDetailPage } from '../pages/MonitorDetailPage';
import { MonitorIncidentsPage } from '../pages/MonitorIncidentsPage';
import { MonitorOverviewPage } from '../pages/MonitorOverviewPage';
import { MonitorsPage } from '../pages/MonitorsPage';
import { NewMonitorPage } from '../pages/NewMonitorPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OverviewPage } from '../pages/OverviewPage';
import { RegisterPage } from '../pages/RegisterPage';
import { RealtimeProvider } from '../realtime/RealtimeProvider';

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
        <Route path="/app" element={<RealtimeProvider><AppShell /></RealtimeProvider>}>
          <Route index element={<OverviewPage />} />
          <Route path="monitors" element={<MonitorsPage />} />
          <Route path="monitors/new" element={<NewMonitorPage />} />
          <Route path="monitors/:monitorId" element={<MonitorDetailPage />}>
            <Route index element={<MonitorOverviewPage />} />
            <Route path="checks" element={<MonitorChecksPage />} />
            <Route path="incidents" element={<MonitorIncidentsPage />} />
            <Route path="configuration" element={<MonitorConfigurationPage />} />
          </Route>
          <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
