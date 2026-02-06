'use client';

import { LogOut, Bell } from 'lucide-react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';

import { Badge } from '@/components/ui/badge';
import { usePendingEscalationCount } from '@/lib/hooks';

export function Header() {
  const { count: pendingCount } = usePendingEscalationCount();

  return (
    <header
      className="glass-header sticky top-0 z-30 flex h-14 items-center justify-between px-6"
      role="banner"
    >
      <div>{/* Breadcrumbs will go here */}</div>

      <div className="flex items-center gap-4">
        {/* Escalation notification badge */}
        <Link
          href="/escalations"
          className="relative flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label={
            pendingCount > 0
              ? `View escalations — ${pendingCount} pending`
              : 'View escalations — none pending'
          }
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center p-0 text-xs"
              aria-hidden="true"
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </Badge>
          )}
        </Link>

        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Sign out of your account"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </header>
  );
}
