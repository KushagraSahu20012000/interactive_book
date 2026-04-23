import { Component, ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Unknown render error"
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary] React render crash", {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="max-w-3xl mx-auto border-4 border-foreground bg-card p-6">
          <h1 className="font-display uppercase text-2xl mb-3">App crashed while rendering</h1>
          <p className="font-bold mb-2">Open browser console and check error logs.</p>
          <pre className="text-sm whitespace-pre-wrap break-words border-2 border-foreground p-3 bg-muted">
            {this.state.message}
          </pre>
        </div>
      </div>
    );
  }
}
