import { LoaderCircle, RefreshCw } from 'lucide-react';

import { useAuth } from '../../auth/auth-context';
import { Brand } from '../ui/Brand';

export function SessionGate() {
  const { logout, retrySession, sessionError } = useAuth();

  return (
    <main className="session-gate" aria-busy={!sessionError}>
      <Brand />
      <div className="session-gate__signal" aria-hidden="true">
        <span />
        <i />
      </div>
      {sessionError ? (
        <>
          <p className="eyebrow">Session check interrupted</p>
          <h1>We could not reach Sentinel.</h1>
          <p>Your saved session is still intact. Retry when the API is reachable.</p>
          <div className="session-gate__actions">
            <button className="button button--primary" type="button" onClick={() => void retrySession()}>
              <RefreshCw size={15} aria-hidden="true" /> Retry session
            </button>
            <button className="button button--quiet" type="button" onClick={() => void logout()}>
              Sign out locally
            </button>
          </div>
        </>
      ) : (
        <>
          <LoaderCircle className="session-gate__loader" size={18} aria-hidden="true" />
          <p className="eyebrow">Restoring secure session</p>
          <h1>Checking your workspace.</h1>
          <p>Confirming your Sentinel identity…</p>
        </>
      )}
    </main>
  );
}
