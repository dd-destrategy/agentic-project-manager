'use client';

import {
  Search,
  Plus,
  CheckCircle2,
  Github,
  Mail,
  MessageSquare,
  Ticket,
  BookOpen,
  FileText,
  Bug,
  Siren,
  LayoutGrid,
  SquareKanban,
  Send,
  Plug,
  Filter,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type ConnectorCategory =
  | 'project_management'
  | 'communication'
  | 'code_devops'
  | 'documents'
  | 'monitoring'
  | 'custom';

interface ConnectorCatalogueItem {
  id: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  icon: string;
  kind: 'native' | 'generic';
  connected: boolean;
  healthy?: boolean;
}

interface ConnectorCatalogueProps {
  connectors: ConnectorCatalogueItem[];
  onConnect: (connectorId: string) => void;
  onManage: (connectorId: string) => void;
}

// ============================================================================
// Icon Mapping
// ============================================================================

const iconMap: Record<string, React.ElementType> = {
  github: Github,
  mail: Mail,
  'message-square': MessageSquare,
  ticket: Ticket,
  'book-open': BookOpen,
  'file-text': FileText,
  bug: Bug,
  siren: Siren,
  'layout-grid': LayoutGrid,
  'square-kanban': SquareKanban,
  send: Send,
  plug: Plug,
};

function ConnectorIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = iconMap[icon] ?? Plug;
  return <Icon className={className} />;
}

// ============================================================================
// Category Configuration
// ============================================================================

const categoryConfig: Record<
  ConnectorCategory,
  { label: string; colour: string }
> = {
  project_management: {
    label: 'Project Management',
    colour: 'bg-blue-100 text-blue-800',
  },
  communication: {
    label: 'Communication',
    colour: 'bg-purple-100 text-purple-800',
  },
  code_devops: {
    label: 'Code & DevOps',
    colour: 'bg-green-100 text-green-800',
  },
  documents: { label: 'Documents', colour: 'bg-amber-100 text-amber-800' },
  monitoring: { label: 'Monitoring', colour: 'bg-red-100 text-red-800' },
  custom: { label: 'Custom', colour: 'bg-gray-100 text-gray-800' },
};

// ============================================================================
// Connector Catalogue
// ============================================================================

export function ConnectorCatalogue({
  connectors,
  onConnect,
  onManage,
}: ConnectorCatalogueProps) {
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<
    ConnectorCategory | 'all'
  >('all');

  const filtered = React.useMemo(() => {
    return connectors.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === 'all' || c.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [connectors, search, categoryFilter]);

  const categories = React.useMemo(() => {
    const cats = new Set(connectors.map((c) => c.category));
    return Array.from(cats).sort();
  }, [connectors]);

  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Connectors</h2>
          <p className="text-muted-foreground">
            {connectedCount} of {connectors.length} connectors active
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search connectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Button
            variant={categoryFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter('all')}
          >
            All
          </Button>
          {categories.map((cat) => {
            const config = categoryConfig[cat as ConnectorCategory];
            return (
              <Button
                key={cat}
                variant={categoryFilter === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter(cat as ConnectorCategory)}
              >
                {config?.label ?? cat}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Connector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            onConnect={() => onConnect(connector.id)}
            onManage={() => onManage(connector.id)}
          />
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No connectors match your search.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Connector Card
// ============================================================================

function ConnectorCard({
  connector,
  onConnect,
  onManage,
}: {
  connector: ConnectorCatalogueItem;
  onConnect: () => void;
  onManage: () => void;
}) {
  const catConfig = categoryConfig[connector.category];

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        connector.connected && 'border-green-200 bg-green-50/30'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                connector.connected
                  ? 'bg-green-100 text-green-700'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <ConnectorIcon icon={connector.icon} className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {connector.name}
                {connector.kind === 'native' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Native
                  </Badge>
                )}
              </CardTitle>
            </div>
          </div>

          {connector.connected && (
            <span className="relative flex h-2.5 w-2.5 mt-1">
              <span
                className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                  connector.healthy ? 'bg-green-500' : 'bg-yellow-500'
                )}
              />
              <span
                className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  connector.healthy ? 'bg-green-500' : 'bg-yellow-500'
                )}
              />
            </span>
          )}
        </div>

        <CardDescription className="mt-1.5 line-clamp-2">
          {connector.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <Badge className={cn('text-xs', catConfig.colour)} variant="outline">
            {catConfig.label}
          </Badge>

          {connector.connected ? (
            <Button variant="outline" size="sm" onClick={onManage}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />
              Manage
            </Button>
          ) : (
            <Button size="sm" onClick={onConnect}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export type { ConnectorCatalogueItem, ConnectorCategory };
