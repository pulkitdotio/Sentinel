import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

interface DeleteMonitorDialogProps {
  deleting: boolean;
  error?: string | null;
  monitorName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteMonitorDialog({ deleting, error, monitorName, onCancel, onConfirm }: DeleteMonitorDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

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
    <div className="dialog-backdrop" role="presentation">
      <div
        className="delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onKeyDown={handleKeyDown}
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
      </div>
    </div>
  );
}
