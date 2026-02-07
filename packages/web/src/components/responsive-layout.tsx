'use client';

import { ClipboardPaste, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { CommandPalette } from '@/components/command-palette';
import { Header } from '@/components/header';
import { IngestDrawer } from '@/components/ingest-drawer';
import { Sidebar } from '@/components/sidebar';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { usePendingExtractedItems } from '@/lib/hooks';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Hide FAB on the full ingest page — the user is already there
  const hideIngestFab = pathname.startsWith('/ingest');

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar - hidden on mobile, visible on md+ screens */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile menu */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetTrigger asChild>
          <button
            className="glass fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl shadow-glass hover:shadow-glass-lg md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        {/* Add top padding on mobile to account for hamburger button */}
        <main
          className="flex-1 overflow-auto p-6 pt-20 md:pt-6"
          role="main"
          aria-label="Page content"
        >
          {children}
        </main>
      </div>

      {/* Floating ingest button — hidden on /ingest page */}
      {!hideIngestFab && <IngestFab onClick={() => setDrawerOpen(true)} />}

      {/* Ingest drawer */}
      <IngestDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* Command palette (Cmd+K) */}
      <CommandPalette />
    </div>
  );
}

// ============================================================================
// Floating Action Button
// ============================================================================

function IngestFab({ onClick }: { onClick: () => void }) {
  const { data } = usePendingExtractedItems();
  const pendingCount = data?.items?.length ?? 0;

  return (
    <button
      onClick={onClick}
      className="glass fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl text-foreground shadow-glass-lg transition-transform hover:scale-105 hover:shadow-glass-lg active:scale-95"
      aria-label={
        pendingCount > 0
          ? `Open ingestion assistant — ${pendingCount} pending items`
          : 'Open ingestion assistant'
      }
    >
      <ClipboardPaste className="h-6 w-6" aria-hidden="true" />
      {pendingCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center p-0 text-xs"
          aria-hidden="true"
        >
          {pendingCount > 9 ? '9+' : pendingCount}
        </Badge>
      )}
    </button>
  );
}
