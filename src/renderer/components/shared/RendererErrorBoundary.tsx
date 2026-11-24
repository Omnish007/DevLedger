import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a failed lazy screen or render subtree recoverable instead of blanking the app. */
export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error('An unexpected renderer error occurred.') };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[DevLedger] Renderer error boundary:', error.message, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="grid min-h-full place-items-center bg-background p-6" role="alert">
          <section className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-3 grid size-9 place-items-center rounded-lg bg-danger/10 text-danger" aria-hidden="true">!</div>
            <h1 className="text-base font-semibold">This workspace view ran into a problem</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your local workspace data has not been deleted. You can try rendering this view again or reload the application.
            </p>
            <details className="mt-4 rounded-md border border-border bg-background p-3 text-xs">
              <summary className="cursor-pointer font-medium">Technical details</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{this.state.error.message}</pre>
            </details>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={this.retry} className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Try this view again
              </button>
              <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Reload workspace
              </button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
