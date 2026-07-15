import { Component, type ErrorInfo, type ReactNode } from "react";

type StartupErrorBoundaryProps = {
  children: ReactNode;
};

type StartupErrorBoundaryState = {
  error: Error | null;
};

export class StartupErrorBoundary extends Component<
  StartupErrorBoundaryProps,
  StartupErrorBoundaryState
> {
  state: StartupErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): StartupErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Pretty Lattice failed during startup.", error, info.componentStack);
  }

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <section
          className="w-full max-w-xl rounded-lg border border-border bg-card p-6 shadow-xl"
          role="alert"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pretty Lattice
          </p>
          <h1 className="mb-3 text-xl font-semibold">The app could not start</h1>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Reload this page. If the problem continues, return to the terminal and restart with
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-foreground">
              prl --verbose
            </code>
            for more details.
          </p>
          <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload page
          </button>
        </section>
      </main>
    );
  }
}
