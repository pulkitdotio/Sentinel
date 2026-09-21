import { AppShell } from '../components/app/AppShell';
import { AppMotionProvider } from '../components/app/AppMotion';
import { RealtimeProvider } from '../realtime/RealtimeProvider';

export function ProtectedAppLayout() {
  return (
    <RealtimeProvider>
      <AppMotionProvider>
        <AppShell />
      </AppMotionProvider>
    </RealtimeProvider>
  );
}
