'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error fallback component displayed when an error is caught
 */
function ErrorFallback({
  error,
  onReset,
}: {
  error?: Error | null;
  onReset?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 p-8 text-center"
    >
      <AlertCircle className="h-12 w-12 text-red-500" aria-hidden="true" />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-red-800">
          Something went wrong
        </h2>
        <p className="text-sm text-red-700">
          {error?.message || 'An unexpected error occurred'}
        </p>
      </div>
      {onReset && (
        <Button
          variant="outline"
          onClick={onReset}
          className="mt-2 gap-2 border-red-300 text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Error boundary component for catching and handling React errors
 *
 * Wraps child components and displays a fallback UI when an error occurs.
 * Supports custom fallback components and error recovery.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging/monitoring
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorFallback error={this.state.error} onReset={this.handleReset} />
      );
    }

    return this.props.children;
  }
}

export { ErrorFallback };
