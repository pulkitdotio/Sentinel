import { AppShell } from '../components/app/AppShell';
import { RealtimeProvider } from '../realtime/RealtimeProvider';

export function ProtectedAppLayout() {
  return (
    <RealtimeProvider>
      <AppShell />
    </RealtimeProvider>
  );
}
