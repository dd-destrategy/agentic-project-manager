'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';

import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    </div>
  );
}
