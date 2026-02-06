'use client';

import {
  LayoutDashboard,
  FolderKanban,
  AlertCircle,
  Settings,
  Activity,
  ClipboardPaste,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Ingest', href: '/ingest', icon: ClipboardPaste },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Activity', href: '/activity', icon: Activity },
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
    <aside className="flex w-64 flex-col border-r bg-card h-full">
      <div className="flex h-14 items-center border-b px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
          onClick={handleLinkClick}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            A
          </div>
          <span>Agentic PM</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleLinkClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
