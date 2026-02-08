'use client';

import {
  LayoutDashboard,
  FolderKanban,
  AlertCircle,
  Settings,
  Activity,
  ClipboardPaste,
  FileText,
  ListChecks,
  Sunrise,
  Plug,
  Bot,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Copilot', href: '/copilot', icon: Bot },
  { name: 'Catch-up', href: '/catchup', icon: Sunrise },
  { name: 'Ingest', href: '/ingest', icon: ClipboardPaste },
  { name: 'Extracted', href: '/extracted', icon: ListChecks },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Activity', href: '/activity', icon: Activity },
  { name: 'Connectors', href: '/connectors', icon: Plug },
  { name: 'Escalations', href: '/escalations', icon: AlertCircle },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();

  const handleLinkClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <aside
      className="glass-sidebar flex w-64 flex-col h-full"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex h-14 items-center border-b border-[var(--glass-border-subtle)] px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
          onClick={handleLinkClick}
          aria-label="Agentic PM — go to dashboard"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            A
          </div>
          <span>Agentic PM</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-2" aria-label="Primary">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleLinkClick}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'glass-nav-item flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
