'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Global error boundary.
 *
 * Catches errors from the root layout itself or streaming SSR failures.
 * Must render its own <html>/<body> since the root layout may have crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div
          className="flex min-h-screen items-center justify-center bg-gray-50 p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle
                className="h-6 w-6 text-red-600"
                aria-hidden="true"
              />
            </div>

            <h1 className="mb-2 text-xl font-semibold text-gray-900">
              Something went wrong
            </h1>

            <p className="mb-6 text-sm text-gray-600">
              {error.message ||
                'An unexpected error occurred. Please try again.'}
            </p>

            {error.digest && (
              <p className="mb-4 text-xs text-gray-400">
                Error ID: {error.digest}
              </p>
            )}

            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
