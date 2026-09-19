import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface PasswordFieldProps {
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  registration: UseFormRegisterReturn;
}

export function PasswordField({ autoComplete, error, registration }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const errorId = 'password-error';

  return (
    <div className="form-field">
      <label htmlFor="password">Password</label>
      <div className="password-input">
        <input
          {...registration}
          id="password"
          type={isVisible ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="password-input__toggle"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((value) => !value)}
        >
          {isVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </div>
      {error ? <p className="form-field__error" id={errorId}>{error}</p> : null}
    </div>
  );
}
