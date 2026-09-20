import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Monitor, MonitorConfiguration, UpdateMonitorRequest } from '../features/monitors/api/monitor-contracts';
import { DeleteMonitorDialog } from '../features/monitors/components/DeleteMonitorDialog';
import { MonitorForm } from '../features/monitors/components/MonitorForm';
import { useDeleteMonitor, useUpdateMonitor } from '../features/monitors/hooks/use-monitors';
import { monitorErrorMessage } from '../features/monitors/monitor-error-message';
import { useMonitorWorkspace } from '../features/monitors/monitor-workspace-context';
import {
  formValuesToMonitorConfiguration,
  monitorToFormValues,
  type MonitorFormValues,
} from '../features/monitors/schemas/monitor-form-schema';
import { formatExactDate, formatRelativeDate } from '../lib/dates';

function changedConfiguration(monitor: Monitor, configuration: MonitorConfiguration): UpdateMonitorRequest {
  const update: UpdateMonitorRequest = {};
  if (configuration.name !== monitor.name) update.name = configuration.name;
  if (configuration.url !== monitor.url) update.url = configuration.url;
  if (configuration.method !== monitor.method) update.method = configuration.method;
  if (configuration.intervalSeconds !== monitor.intervalSeconds) update.intervalSeconds = configuration.intervalSeconds;
  if (configuration.timeoutMs !== monitor.timeoutMs) update.timeoutMs = configuration.timeoutMs;
  if (configuration.latencyThresholdMs !== monitor.latencyThresholdMs) update.latencyThresholdMs = configuration.latencyThresholdMs;
  if (configuration.failureThreshold !== monitor.failureThreshold) update.failureThreshold = configuration.failureThreshold;
  if (configuration.recoveryThreshold !== monitor.recoveryThreshold) update.recoveryThreshold = configuration.recoveryThreshold;
  if (configuration.expectedStatusCodes.join(',') !== monitor.expectedStatusCodes.join(',')) update.expectedStatusCodes = configuration.expectedStatusCodes;
  if (configuration.regions.join(',') !== monitor.regions.join(',')) update.regions = configuration.regions;
  return update;
}

export function MonitorConfigurationPage() {
  const monitor = useMonitorWorkspace();
  const navigate = useNavigate();
  const updateMonitor = useUpdateMonitor(monitor.id);
  const deleteMonitor = useDeleteMonitor(monitor.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const save = async (values: MonitorFormValues) => {
    setSavedMessage(null);
    const update = changedConfiguration(monitor, formValuesToMonitorConfiguration(values));
    if (Object.keys(update).length === 0) {
      setSavedMessage('No configuration changes to save.');
      return;
    }
    await updateMonitor.mutateAsync(update);
    setSavedMessage('Configuration saved.');
  };

  const confirmDelete = async () => {
    await deleteMonitor.mutateAsync();
    await navigate('/app/monitors', { replace: true });
  };

  return (
    <div className="monitor-workspace__content monitor-configuration">
      <section className="monitor-facts" aria-label="Current monitor state">
        <div><span>Method</span><strong>{monitor.method}</strong></div>
        <div><span>Regions</span><strong>{monitor.regions.length}</strong><small>{monitor.regions.join(' · ')}</small></div>
        <div><span>Last checked</span><strong>{formatRelativeDate(monitor.lastCheckedAt)}</strong><small>{monitor.lastCheckedAt ? formatExactDate(monitor.lastCheckedAt) : 'No completed checks'}</small></div>
        <div><span>Next scheduled</span><strong>{monitor.isPaused ? 'Paused' : formatRelativeDate(monitor.nextCheckAt)}</strong><small>{monitor.isPaused ? 'Resume to schedule checks' : formatExactDate(monitor.nextCheckAt)}</small></div>
      </section>

      <div className="configuration-heading">
        <div><h2>Configuration</h2><p>Changes to active monitors make them immediately due for a new check.</p></div>
        {savedMessage ? <span role="status">{savedMessage}</span> : null}
      </div>
      <MonitorForm
        key={monitor.updatedAt}
        mode="edit"
        defaultValues={monitorToFormValues(monitor)}
        submitting={updateMonitor.isPending}
        apiError={updateMonitor.isError ? monitorErrorMessage(updateMonitor.error) : null}
        onSubmit={save}
      />

      <section className="danger-zone">
        <div><h2>Delete monitor</h2><p>Permanently remove this monitor and its configuration.</p></div>
        <button className="button button--danger-quiet" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={14} aria-hidden="true" /> Delete</button>
      </section>

      {deleteOpen ? (
        <DeleteMonitorDialog
          monitorName={monitor.name}
          deleting={deleteMonitor.isPending}
          onCancel={() => { if (!deleteMonitor.isPending) setDeleteOpen(false); }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
