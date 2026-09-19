import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { Brand } from '../components/ui/Brand';
import { StatusDot } from '../components/ui/StatusDot';

export function AppPlaceholderPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    await navigate('/login', { replace: true });
  };

  return (
    <main className="app-placeholder">
      <header className="app-placeholder__header">
        <Brand />
        <button className="button button--quiet" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <section className="app-placeholder__content">
        <div className="app-placeholder__icon"><ShieldCheck size={26} aria-hidden="true" /></div>
        <StatusDot label="Secure session active" />
        <p className="eyebrow">Sentinel workspace</p>
        <h1>Welcome back, {user?.name}.</h1>
        <p>Your monitoring workspace is ready. Monitor management arrives in Frontend Phase 2.</p>
        <div className="app-placeholder__profile">
          <span>Signed in as</span>
          <strong>{user?.email}</strong>
        </div>
        <Link className="app-placeholder__back" to="/"><ArrowLeft size={14} aria-hidden="true" /> Return to the Sentinel overview</Link>
      </section>
    </main>
  );
}
