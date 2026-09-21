import { AlertTriangle, X } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

import { appFastTransition } from '../../../components/app/app-motion-config';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';

interface DeleteMonitorDialogProps {
  deleting: boolean;
  error?: string | null;
  monitorName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteMonitorDialog({ deleting, error, monitorName, onCancel, onConfirm }: DeleteMonitorDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButton.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !deleting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <m.div
      className="dialog-backdrop"
      role="presentation"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={prefersReducedMotion ? { duration: 0 } : appFastTransition}
    >
      <m.div
        className="delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onKeyDown={handleKeyDown}
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.975, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : appFastTransition}
      >
        <div className="delete-dialog__header">
          <span><AlertTriangle size={20} aria-hidden="true" /></span>
          <button type="button" aria-label="Close delete confirmation" disabled={deleting} onClick={onCancel}><X size={17} aria-hidden="true" /></button>
        </div>
        <h2 id="delete-dialog-title">Delete {monitorName}?</h2>
        <p id="delete-dialog-description">This monitor will be permanently deleted. This action cannot be undone.</p>
        {error ? <p className="delete-dialog__error" role="alert">{error}</p> : null}
        <div className="delete-dialog__actions">
          <button ref={cancelButton} className="button button--secondary" type="button" disabled={deleting} onClick={onCancel}>Cancel</button>
          <button className="button button--danger" type="button" disabled={deleting} onClick={onConfirm}>{deleting ? 'Deleting…' : 'Delete monitor'}</button>
        </div>
      </m.div>
    </m.div>
  );
}
