import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { SessionGate } from '../components/auth/SessionGate';
import { ContentLoadingFallback, RouteLoadingFallback } from './RouteLoadingFallback';

const AuthLayout = lazy(() => import('../components/auth/AuthLayout').then((module) => ({ default: module.AuthLayout })));
const ProtectedAppLayout = lazy(() => import('./ProtectedAppLayout').then((module) => ({ default: module.ProtectedAppLayout })));
const LandingPage = lazy(() => import('../pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('../pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const OverviewPage = lazy(() => import('../pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const MonitorsPage = lazy(() => import('../pages/MonitorsPage').then((module) => ({ default: module.MonitorsPage })));
const NewMonitorPage = lazy(() => import('../pages/NewMonitorPage').then((module) => ({ default: module.NewMonitorPage })));
const MonitorDetailPage = lazy(() => import('../pages/MonitorDetailPage').then((module) => ({ default: module.MonitorDetailPage })));
const MonitorOverviewPage = lazy(() => import('../pages/MonitorOverviewPage').then((module) => ({ default: module.MonitorOverviewPage })));
const MonitorChecksPage = lazy(() => import('../pages/MonitorChecksPage').then((module) => ({ default: module.MonitorChecksPage })));
const MonitorIncidentsPage = lazy(() => import('../pages/MonitorIncidentsPage').then((module) => ({ default: module.MonitorIncidentsPage })));
const MonitorConfigurationPage = lazy(() => import('../pages/MonitorConfigurationPage').then((module) => ({ default: module.MonitorConfigurationPage })));
const IncidentDetailPage = lazy(() => import('../pages/IncidentDetailPage').then((module) => ({ default: module.IncidentDetailPage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const AppNotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.AppNotFoundPage })));

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

function FullPageRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>;
}

function ContentRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ContentLoadingFallback />}><div className="app-page-transition" data-app-motion="page">{children}</div></Suspense>;
}

export function AppRoutes() {
  const { status } = useAuth();
  if (status === 'checking') return <SessionGate />;

  return (
    <Routes>
      <Route path="/" element={<FullPageRoute><LandingPage /></FullPageRoute>} />
      <Route element={<GuestOnlyRoute />}>
        <Route element={<FullPageRoute><AuthLayout /></FullPageRoute>}>
          <Route path="/login" element={<ContentRoute><LoginPage /></ContentRoute>} />
          <Route path="/register" element={<ContentRoute><RegisterPage /></ContentRoute>} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<FullPageRoute><ProtectedAppLayout /></FullPageRoute>}>
          <Route index element={<ContentRoute><OverviewPage /></ContentRoute>} />
          <Route path="monitors" element={<ContentRoute><MonitorsPage /></ContentRoute>} />
          <Route path="monitors/new" element={<ContentRoute><NewMonitorPage /></ContentRoute>} />
          <Route path="monitors/:monitorId" element={<ContentRoute><MonitorDetailPage /></ContentRoute>}>
            <Route index element={<ContentRoute><MonitorOverviewPage /></ContentRoute>} />
            <Route path="checks" element={<ContentRoute><MonitorChecksPage /></ContentRoute>} />
            <Route path="incidents" element={<ContentRoute><MonitorIncidentsPage /></ContentRoute>} />
            <Route path="configuration" element={<ContentRoute><MonitorConfigurationPage /></ContentRoute>} />
          </Route>
          <Route path="incidents/:incidentId" element={<ContentRoute><IncidentDetailPage /></ContentRoute>} />
          <Route path="*" element={<ContentRoute><AppNotFoundPage /></ContentRoute>} />
        </Route>
      </Route>
      <Route path="*" element={<FullPageRoute><NotFoundPage /></FullPageRoute>} />
    </Routes>
  );
}
