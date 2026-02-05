'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

/**
 * Escalation banner component
 *
 * Shows prominent alert when there are pending escalations.
 */
export function EscalationBanner() {
  // TODO: Implement with TanStack Query in Sprint 5
  const pendingCount = 0;

  if (pendingCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-4">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-yellow-600" />
        <div>
          <p className="font-medium text-yellow-800">
            {pendingCount} escalation{pendingCount !== 1 ? 's' : ''} need your attention
          </p>
          <p className="text-sm text-yellow-700">
            The agent needs your input to proceed
          </p>
        </div>
      </div>

      <Link
        href="/escalations"
        className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
      >
        Review
      </Link>
    </div>
  );
}
