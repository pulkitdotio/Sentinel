import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ApplicationErrorBoundaryProps {
  children: ReactNode;
  reloadApplication?: () => void;
}

interface ApplicationErrorBoundaryState {
  hasError: boolean;
}

export class ApplicationErrorBoundary extends Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  public state: ApplicationErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ApplicationErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('Sentinel render failure', error, errorInfo);
  }

  public render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="application-error" role="alert">
        <div className="application-error__brand" aria-label="Sentinel">SENTINEL</div>
        <p className="eyebrow">Application recovery</p>
        <h1>Sentinel hit an unexpected problem.</h1>
        <p>Your monitoring data is still stored on the server.</p>
        <button
          className="button button--primary"
          type="button"
          onClick={this.props.reloadApplication ?? (() => window.location.reload())}
        >
          Reload application
        </button>
      </main>
    );
  }
}
