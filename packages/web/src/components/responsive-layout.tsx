'use client';

import { ClipboardPaste, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

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
            className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <Header />
        {/* Add top padding on mobile to account for hamburger button */}
        <main className="flex-1 overflow-auto p-6 pt-20 md:pt-6">
          {children}
        </main>
      </div>

      {/* Floating ingest button — hidden on /ingest page */}
      {!hideIngestFab && <IngestFab onClick={() => setDrawerOpen(true)} />}

      {/* Ingest drawer */}
      <IngestDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
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
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:shadow-xl active:scale-95"
      aria-label="Open ingestion assistant"
      title="Open ingestion assistant"
    >
      <ClipboardPaste className="h-6 w-6" />
      {pendingCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center p-0 text-xs"
        >
          {pendingCount > 9 ? '9+' : pendingCount}
        </Badge>
      )}
    </button>
  );
}
