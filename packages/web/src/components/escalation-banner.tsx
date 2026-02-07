'use client';

import { AlertCircle, ArrowRight, Bell } from 'lucide-react';
import Link from 'next/link';

import { usePendingEscalationCount } from '@/lib/hooks';

/**
 * Escalation banner component
 *
 * Shows prominent alert when there are pending escalations requiring attention.
 * Uses TanStack Query with 30-second polling to fetch real escalation data.
 */
export function EscalationBanner() {
  const { count: pendingCount, isLoading, error } = usePendingEscalationCount();

  // Don't show banner while loading or if no escalations
  if (isLoading || pendingCount === 0) {
    return null;
  }

  // Show subtle error if escalation data failed to load
  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        role="alert"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Unable to check for pending escalations</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4"
      role="alert"
      aria-live="polite"
    >
      {/* Animated attention indicator */}
      <div className="absolute -right-4 -top-4 h-24 w-24 animate-pulse rounded-full bg-amber-200/50" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Icon with notification badge */}
          <div className="relative">
            <div className="rounded-full bg-amber-100 p-2">
              <Bell className="h-5 w-5 text-[#d97706]" />
            </div>
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#d97706] text-xs font-bold text-white">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          </div>

          <div>
            <p className="font-semibold text-amber-900">
              {pendingCount} escalation{pendingCount !== 1 ? 's' : ''} need
              {pendingCount === 1 ? 's' : ''} your attention
            </p>
            <p className="text-sm text-amber-700">
              The agent is waiting for your input to proceed with{' '}
              {pendingCount === 1 ? 'a decision' : 'these decisions'}
            </p>
          </div>
        </div>

        <Link
          href="/escalations"
          className="flex items-center gap-2 rounded-md bg-[#d97706] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Review Now
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Urgency indicator for multiple escalations */}
      {pendingCount > 1 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>
            Multiple decisions pending - review to prevent workflow delays
          </span>
        </div>
      )}
    </div>
  );
}
