import { Activity, MapPin } from 'lucide-react';
import { Outlet } from 'react-router-dom';

import { regionalChecks } from '../../lib/presentational-data';
import { Brand } from '../ui/Brand';
import { StatusDot } from '../ui/StatusDot';

export function AuthLayout() {
  return (
    <main className="auth-shell">
      <aside className="auth-context" aria-label="Sentinel monitoring preview">
        <Brand />
        <div className="auth-context__copy">
          <p className="eyebrow">Distributed monitoring</p>
          <h1>Return to a clearer view of reliability.</h1>
          <p>Regional evidence, deterministic incidents, and the health of your API in one focused workspace.</p>
        </div>
        <div className="auth-telemetry" aria-label="Static monitoring telemetry">
          <div className="auth-telemetry__header">
            <span><Activity size={15} aria-hidden="true" /> api.example.com</span>
            <StatusDot label="99.98% uptime" />
          </div>
          {regionalChecks.map((region) => (
            <div className="auth-telemetry__row" key={region.code}>
              <span><MapPin size={13} aria-hidden="true" /> {region.city}</span>
              <code>{region.latency}</code>
            </div>
          ))}
          <p>Regional telemetry example</p>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-panel__mobile-brand"><Brand /></div>
        <Outlet />
        <p className="auth-panel__note">Your password is sent only to Sentinel for authentication and is never stored in this browser.</p>
      </section>
    </main>
  );
}
