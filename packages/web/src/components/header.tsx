'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LogOut, Bell } from 'lucide-react';
import { usePendingEscalationCount } from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { count: pendingCount } = usePendingEscalationCount();

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div>{/* Breadcrumbs will go here */}</div>

      <div className="flex items-center gap-4">
        {/* Escalation notification badge */}
        <Link
          href="/escalations"
          className="relative flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          title={
            pendingCount > 0
              ? `${pendingCount} pending escalation${pendingCount !== 1 ? 's' : ''}`
              : 'No pending escalations'
          }
        >
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center p-0 text-xs"
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </Badge>
          )}
        </Link>

        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </header>
  );
}
