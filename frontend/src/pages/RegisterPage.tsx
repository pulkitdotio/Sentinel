import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { authErrorMessage } from '../auth/auth-error-message';
import { useAuth } from '../auth/auth-context';
import { registerFormSchema, type RegisterFormValues } from '../auth/form-schemas';
import { PasswordField } from '../components/auth/PasswordField';

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmissionError(null);
    try {
      await createAccount(values);
      await navigate('/app', { replace: true });
    } catch (error: unknown) {
      setSubmissionError(authErrorMessage(error));
    }
  });

  return (
    <div className="auth-form-wrap">
      <div className="auth-form__heading">
        <p className="eyebrow">Begin monitoring</p>
        <h1>Create your workspace.</h1>
        <p>Start with a secure account. Your first monitor comes in the next phase.</p>
      </div>
      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-field">
          <label htmlFor="name">Name</label>
          <input
            {...register('name')}
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Pulkit"
            aria-invalid={errors.name ? 'true' : 'false'}
            aria-describedby={errors.name ? 'name-error' : undefined}
          />
          {errors.name ? <p className="form-field__error" id="name-error">{errors.name.message}</p> : null}
        </div>
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
          autoComplete="new-password"
          error={errors.password?.message}
          registration={register('password')}
        />
        <p className="form-field__hint">Use 8–128 characters.</p>
        {submissionError ? <div className="form-submit-error" role="alert">{submissionError}</div> : null}
        <button className="button button--primary auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
          {!isSubmitting ? <ArrowRight size={16} aria-hidden="true" /> : null}
        </button>
      </form>
      <p className="auth-switch">Already monitoring? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
