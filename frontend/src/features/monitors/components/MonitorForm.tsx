import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Globe2, MapPin, ShieldCheck, Timer } from 'lucide-react';
import { useForm, type FieldError, type UseFormRegisterReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { MONITOR_REGIONS } from '../api/monitor-contracts';
import {
  defaultMonitorFormValues,
  monitorFormSchema,
  type MonitorFormValues,
} from '../schemas/monitor-form-schema';

const regionDetails = {
  mumbai: { label: 'Mumbai', code: 'BOM' },
  singapore: { label: 'Singapore', code: 'SIN' },
  frankfurt: { label: 'Frankfurt', code: 'FRA' },
} as const;

interface FormFieldProps {
  children: React.ReactNode;
  error?: FieldError;
  hint?: string;
  id: string;
  label: string;
}

function FormField({ children, error, hint, id, label }: FormFieldProps) {
  return (
    <div className="monitor-form__field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="monitor-form__error">{error.message}</p> : null}
      {!error && hint ? <p id={`${id}-hint`} className="monitor-form__hint">{hint}</p> : null}
    </div>
  );
}

function fieldAccessibility(id: string, error: FieldError | undefined, hint?: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

interface NumberFieldProps {
  error?: FieldError;
  hint: string;
  id: string;
  label: string;
  max: number;
  min: number;
  registration: UseFormRegisterReturn;
  suffix: string;
}

function NumberField({ error, hint, id, label, max, min, registration, suffix }: NumberFieldProps) {
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <div className="monitor-form__number">
        <input id={id} type="number" min={min} max={max} step="1" {...registration} {...fieldAccessibility(id, error, hint)} />
        <span>{suffix}</span>
      </div>
    </FormField>
  );
}

interface MonitorFormProps {
  apiError?: string | null;
  defaultValues?: MonitorFormValues;
  mode: 'create' | 'edit';
  onSubmit: (values: MonitorFormValues) => Promise<void>;
  submitting: boolean;
}

export function MonitorForm({ apiError, defaultValues = defaultMonitorFormValues, mode, onSubmit, submitting }: MonitorFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<MonitorFormValues>({
    resolver: zodResolver(monitorFormSchema),
    defaultValues,
  });

  return (
    <form className="monitor-form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <section className="monitor-form__section" aria-labelledby="endpoint-section-title">
        <div className="monitor-form__section-heading">
          <span><Globe2 size={17} aria-hidden="true" /></span>
          <div><h2 id="endpoint-section-title">Endpoint</h2><p>Define the address and request Sentinel will execute.</p></div>
        </div>
        <div className="monitor-form__grid">
          <FormField id="monitor-name" label="Monitor name" error={errors.name} hint="A short label for this service.">
            <input id="monitor-name" type="text" autoComplete="off" placeholder="Production API" maxLength={100} {...register('name')} {...fieldAccessibility('monitor-name', errors.name, 'A short label for this service.')} />
          </FormField>
          <FormField id="monitor-method" label="HTTP method" error={errors.method} hint="GET retrieves the endpoint; HEAD requests headers only.">
            <select id="monitor-method" {...register('method')} {...fieldAccessibility('monitor-method', errors.method, 'GET retrieves the endpoint; HEAD requests headers only.')}>
              <option value="GET">GET</option>
              <option value="HEAD">HEAD</option>
            </select>
          </FormField>
          <div className="monitor-form__wide">
            <FormField id="monitor-url" label="Endpoint URL" error={errors.url} hint="Absolute HTTP or HTTPS URL without embedded credentials.">
              <input id="monitor-url" type="text" inputMode="url" autoComplete="url" placeholder="https://api.example.com/health" maxLength={2_048} {...register('url')} {...fieldAccessibility('monitor-url', errors.url, 'Absolute HTTP or HTTPS URL without embedded credentials.')} />
            </FormField>
          </div>
        </div>
      </section>

      <section className="monitor-form__section" aria-labelledby="behavior-section-title">
        <div className="monitor-form__section-heading">
          <span><Timer size={17} aria-hidden="true" /></span>
          <div><h2 id="behavior-section-title">Check behavior</h2><p>Control cadence, request limits, and valid responses.</p></div>
        </div>
        <div className="monitor-form__grid monitor-form__grid--three">
          <NumberField id="monitor-interval" label="Check interval" hint="10 to 86,400 seconds." suffix="sec" min={10} max={86_400} error={errors.intervalSeconds} registration={register('intervalSeconds', { valueAsNumber: true })} />
          <NumberField id="monitor-timeout" label="Request timeout" hint="100 to 30,000 milliseconds." suffix="ms" min={100} max={30_000} error={errors.timeoutMs} registration={register('timeoutMs', { valueAsNumber: true })} />
          <FormField id="monitor-status-codes" label="Expected status codes" error={errors.expectedStatusCodes} hint="One to 20 unique codes, separated by commas.">
            <input id="monitor-status-codes" type="text" inputMode="numeric" placeholder="200, 204" {...register('expectedStatusCodes')} {...fieldAccessibility('monitor-status-codes', errors.expectedStatusCodes, 'One to 20 unique codes, separated by commas.')} />
          </FormField>
        </div>
      </section>

      <section className="monitor-form__section" aria-labelledby="reliability-section-title">
        <div className="monitor-form__section-heading">
          <span><ShieldCheck size={17} aria-hidden="true" /></span>
          <div><h2 id="reliability-section-title">Reliability</h2><p>Set deterministic thresholds for slow responses and state changes.</p></div>
        </div>
        <div className="monitor-form__grid monitor-form__grid--three">
          <NumberField id="monitor-latency" label="Latency threshold" hint="1 to 60,000 milliseconds." suffix="ms" min={1} max={60_000} error={errors.latencyThresholdMs} registration={register('latencyThresholdMs', { valueAsNumber: true })} />
          <NumberField id="monitor-failure" label="Failure threshold" hint="Consecutive failed cycles, 1 to 10." suffix="cycles" min={1} max={10} error={errors.failureThreshold} registration={register('failureThreshold', { valueAsNumber: true })} />
          <NumberField id="monitor-recovery" label="Recovery threshold" hint="Consecutive healthy cycles, 1 to 10." suffix="cycles" min={1} max={10} error={errors.recoveryThreshold} registration={register('recoveryThreshold', { valueAsNumber: true })} />
        </div>
      </section>

      <section className="monitor-form__section" aria-labelledby="regions-section-title">
        <div className="monitor-form__section-heading">
          <span><MapPin size={17} aria-hidden="true" /></span>
          <div><h2 id="regions-section-title">Probe regions</h2><p>Select at least one independent location.</p></div>
        </div>
        <fieldset className="region-options" aria-describedby={errors.regions ? 'monitor-regions-error' : undefined}>
          <legend className="sr-only">Probe regions</legend>
          {MONITOR_REGIONS.map((region) => (
            <label className="region-option" key={region}>
              <input type="checkbox" value={region} {...register('regions')} />
              <span className="region-option__code">{regionDetails[region].code}</span>
              <span><strong>{regionDetails[region].label}</strong><small>{region}</small></span>
              <i aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        {errors.regions ? <p id="monitor-regions-error" className="monitor-form__error" role="alert">{errors.regions.message}</p> : null}
      </section>

      {apiError ? <p className="monitor-form__submit-error" role="alert">{apiError}</p> : null}

      <div className="monitor-form__actions">
        {mode === 'create' ? <Link className="button button--quiet" to="/app/monitors"><ArrowLeft size={14} aria-hidden="true" /> Cancel</Link> : null}
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? (mode === 'create' ? 'Creating monitor…' : 'Saving changes…') : (mode === 'create' ? 'Create monitor' : 'Save changes')}
        </button>
      </div>
    </form>
  );
}
