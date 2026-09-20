import { Activity, LogOut, Menu, Monitor, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/auth-context';
import { Brand } from '../ui/Brand';

const navigation = [
  { label: 'Overview', to: '/app', icon: Activity, end: true },
  { label: 'Monitors', to: '/app/monitors', icon: Monitor, end: false },
] as const;

export function AppShell() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);

  const signOut = async () => {
    await logout();
    await navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-content">Skip to workspace</a>
      <header className="app-topbar">
        <Brand to="/app" />
        <button
          type="button"
          className="app-icon-button"
          aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={navigationOpen}
          aria-controls="app-navigation"
          onClick={() => setNavigationOpen((open) => !open)}
        >
          {navigationOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
        </button>
      </header>

      {navigationOpen ? (
        <button
          className="app-navigation-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />
      ) : null}

      <aside id="app-navigation" className={`app-sidebar${navigationOpen ? ' is-open' : ''}`}>
        <div className="app-sidebar__brand"><Brand to="/app" /></div>
        <nav className="app-navigation" aria-label="Workspace navigation">
          <p>Workspace</p>
          {navigation.map(({ end, icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setNavigationOpen(false)}
              className={({ isActive }) => `app-navigation__link${isActive ? ' is-active' : ''}`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="app-sidebar__profile">
          <div className="app-user">
            <span aria-hidden="true">{user?.name.trim().charAt(0).toUpperCase()}</span>
            <div><strong>{user?.name}</strong><small title={user?.email}>{user?.email}</small></div>
          </div>
          <button type="button" className="app-sidebar__logout" onClick={() => void signOut()}>
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      <main id="app-content" className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
