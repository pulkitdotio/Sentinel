import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { authErrorMessage } from '../auth/auth-error-message';
import { useAuth } from '../auth/auth-context';
import { loginFormSchema, type LoginFormValues } from '../auth/form-schemas';
import { PasswordField } from '../components/auth/PasswordField';

interface IntendedLocationState {
  from?: {
    hash?: string;
    pathname?: string;
    search?: string;
  };
}

function intendedDestination(state: unknown): string {
  if (typeof state !== 'object' || state === null) return '/app';
  const from = (state as IntendedLocationState).from;
  if (!from?.pathname?.startsWith('/') || from.pathname.startsWith('//')) return '/app';
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmissionError(null);
    try {
      await login(values);
      await navigate(intendedDestination(location.state), { replace: true });
    } catch (error: unknown) {
      setSubmissionError(authErrorMessage(error));
    }
  });

  return (
    <div className="auth-form-wrap">
      <div className="auth-form__heading">
        <p className="eyebrow">Secure workspace access</p>
        <h1>Welcome back.</h1>
        <p>Sign in with the email and password attached to your Sentinel account.</p>
      </div>
      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            {...register('email')}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email ? <p className="form-field__error" id="email-error">{errors.email.message}</p> : null}
        </div>
        <PasswordField
          autoComplete="current-password"
          error={errors.password?.message}
          registration={register('password')}
        />
        {submissionError ? <div className="form-submit-error" role="alert">{submissionError}</div> : null}
        <button className="button button--primary auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          {!isSubmitting ? <ArrowRight size={16} aria-hidden="true" /> : null}
        </button>
      </form>
      <p className="auth-switch">New to Sentinel? <Link to="/register">Create an account</Link></p>
    </div>
  );
}
