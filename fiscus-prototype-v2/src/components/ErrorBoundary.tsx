import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Last line of defence: a render error shows a message and a way back
 * instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="max-w-xl mx-auto mt-24 px-6 text-center">
        <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-[var(--muted)] mb-4">{this.state.error.message}</p>
        <button
          className="text-sm text-[var(--accent-deep)] hover:underline"
          onClick={() => {
            window.location.hash = "#/";
            window.location.reload();
          }}
        >
          Back to directory
        </button>
      </div>
    );
  }
}
