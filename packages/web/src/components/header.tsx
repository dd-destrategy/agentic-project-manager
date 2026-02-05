'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div>{/* Breadcrumbs will go here */}</div>

      <button
        onClick={() => signOut({ callbackUrl: '/auth/signin' })}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </header>
  );
}
