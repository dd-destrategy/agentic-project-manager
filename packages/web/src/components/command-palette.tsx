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
  Search,
  MessageSquare,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Register Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigate = useCallback(
    (path: string) => {
      router.push(path);
      setOpen(false);
    },
    [router]
  );

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Dashboard',
        description: 'Overview and stats',
        icon: LayoutDashboard,
        action: () => navigate('/dashboard'),
        keywords: ['home', 'overview'],
      },
      {
        id: 'ingest',
        label: 'Ingest',
        description: 'Paste and process content',
        icon: ClipboardPaste,
        action: () => navigate('/ingest'),
        keywords: ['paste', 'import', 'add'],
      },
      {
        id: 'extracted',
        label: 'Extracted Items',
        description: 'Review extracted items',
        icon: ListChecks,
        action: () => navigate('/extracted'),
        keywords: ['review', 'items', 'pending'],
      },
      {
        id: 'reports',
        label: 'Reports',
        description: 'Generate status reports',
        icon: FileText,
        action: () => navigate('/reports'),
        keywords: ['status', 'generate'],
      },
      {
        id: 'projects',
        label: 'Projects',
        description: 'Manage projects',
        icon: FolderKanban,
        action: () => navigate('/projects'),
        keywords: ['manage'],
      },
      {
        id: 'activity',
        label: 'Activity',
        description: 'View agent activity',
        icon: Activity,
        action: () => navigate('/activity'),
        keywords: ['events', 'log', 'history'],
      },
      {
        id: 'escalations',
        label: 'Escalations',
        description: 'Review pending decisions',
        icon: AlertCircle,
        action: () => navigate('/escalations'),
        keywords: ['decisions', 'pending', 'urgent'],
      },
      {
        id: 'catchup',
        label: 'Catch-up',
        description: 'See what happened since you left',
        icon: Sunrise,
        action: () => navigate('/catchup'),
        keywords: ['since', 'summary', 'changes'],
      },
      {
        id: 'ask',
        label: 'Ask a Question',
        description: 'Natural language project query',
        icon: MessageSquare,
        action: () => navigate('/ask'),
        keywords: ['query', 'search', 'question'],
      },
      {
        id: 'settings',
        label: 'Settings',
        description: 'Configuration',
        icon: Settings,
        action: () => navigate('/settings'),
        keywords: ['config', 'preferences'],
      },
    ],
    [navigate]
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) => {
      return (
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.keywords?.some((kw) => kw.includes(q))
      );
    });
  }, [commands, query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, selectedIndex]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="glass overflow-hidden p-0 shadow-glass-lg sm:max-w-lg"
        aria-label="Command palette"
      >
        <div className="flex items-center border-b border-[var(--glass-border-subtle)] px-3">
          <Search
            className="mr-2 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="flex h-12 w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commands"
          />
          <kbd className="pointer-events-none ml-2 hidden select-none rounded border border-[var(--glass-border-subtle)] bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>
        <div
          className="max-h-80 overflow-y-auto p-1"
          role="listbox"
          aria-label="Commands"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                role="option"
                aria-selected={idx === selectedIndex}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                  idx === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50'
                )}
                onClick={() => cmd.action()}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <cmd.icon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="flex flex-col items-start">
                  <span className="font-medium">{cmd.label}</span>
                  {cmd.description && (
                    <span className="text-xs text-muted-foreground">
                      {cmd.description}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--glass-border-subtle)] px-3 py-2">
          <span className="text-xs text-muted-foreground">
            <kbd className="rounded border px-1 text-[10px]">
              &#8593;&#8595;
            </kbd>{' '}
            navigate{' '}
            <kbd className="rounded border px-1 text-[10px]">&#8629;</kbd>{' '}
            select <kbd className="rounded border px-1 text-[10px]">esc</kbd>{' '}
            close
          </span>
          <span className="text-xs text-muted-foreground">
            <kbd className="rounded border px-1 text-[10px]">&#8984;K</kbd>{' '}
            toggle
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
