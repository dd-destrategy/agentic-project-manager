import { FileQuestion, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/**
 * Global 404 page.
 *
 * Shown when a user navigates to a route that does not exist.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <FileQuestion
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <h1 className="mb-2 text-2xl font-bold">Page not found</h1>

        <p className="mb-8 text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
