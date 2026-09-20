import { useNavigate } from 'react-router-dom';

import { MonitorForm } from '../features/monitors/components/MonitorForm';
import { useCreateMonitor } from '../features/monitors/hooks/use-monitors';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { formValuesToMonitorConfiguration, type MonitorFormValues } from '../features/monitors/schemas/monitor-form-schema';

export function NewMonitorPage() {
  const createMonitor = useCreateMonitor();
  const navigate = useNavigate();

  const submit = async (values: MonitorFormValues) => {
    const monitor = await createMonitor.mutateAsync(formValuesToMonitorConfiguration(values));
    await navigate(`/app/monitors/${monitor.id}`);
  };

  return (
    <div className="workspace-page workspace-page--form">
      <header className="workspace-heading">
        <p className="eyebrow">Monitors / New</p>
        <h1>Create a monitor</h1>
        <p>Configure a deterministic HTTP check across Sentinel's enabled probe regions.</p>
      </header>
      <MonitorForm
        mode="create"
        submitting={createMonitor.isPending}
        apiError={createMonitor.isError ? monitorErrorMessage(createMonitor.error) : null}
        onSubmit={submit}
      />
    </div>
  );
}
