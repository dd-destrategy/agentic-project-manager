'use client';

import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Activity,
  RefreshCw,
  PowerOff,
  Trash2,
  Clock,
  Zap,
  BarChart3,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface ConnectorInstanceData {
  connectorId: string;
  connectorName: string;
  icon: string;
  category: string;
  enabled: boolean;
  healthy: boolean;
  lastHealthCheck?: string;
  consecutiveFailures: number;
  lastError?: string;
  latencyMs?: number;
  signalCount24h: number;
  signalCount7d: number;
  createdAt: string;
}

interface ConnectorMonitorProps {
  instances: ConnectorInstanceData[];
  onToggle: (connectorId: string, enabled: boolean) => void;
  onTestConnection: (connectorId: string) => void;
  onDisconnect: (connectorId: string) => void;
}

// ============================================================================
// Health Status
// ============================================================================

type HealthVariant = 'healthy' | 'degraded' | 'error' | 'disabled';

function getHealthVariant(instance: ConnectorInstanceData): HealthVariant {
  if (!instance.enabled) return 'disabled';
  if (instance.healthy && instance.consecutiveFailures === 0) return 'healthy';
  if (instance.consecutiveFailures >= 3) return 'error';
  return 'degraded';
}

const healthConfig: Record<
  HealthVariant,
  { label: string; icon: React.ElementType; colour: string; dotClass: string }
> = {
  healthy: {
    label: 'Healthy',
    icon: CheckCircle2,
    colour: 'text-green-700 bg-green-50 border-green-200',
    dotClass: 'bg-green-500',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    colour: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    dotClass: 'bg-yellow-500',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    colour: 'text-red-700 bg-red-50 border-red-200',
    dotClass: 'bg-red-500',
  },
  disabled: {
    label: 'Disabled',
    icon: PowerOff,
    colour: 'text-gray-500 bg-gray-50 border-gray-200',
    dotClass: 'bg-gray-400',
  },
};

// ============================================================================
// Relative Time Formatter
// ============================================================================

function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ============================================================================
// Connector Monitor
// ============================================================================

export function ConnectorMonitor({
  instances,
  onToggle,
  onTestConnection,
  onDisconnect,
}: ConnectorMonitorProps) {
  if (instances.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>No connectors configured yet.</p>
          <p className="text-sm mt-1">
            Connect a service from the catalogue to start ingesting signals.
          </p>
        </CardContent>
      </Card>
    );
  }

  const healthyCount = instances.filter((i) => i.enabled && i.healthy).length;
  const errorCount = instances.filter(
    (i) => i.enabled && i.consecutiveFailures >= 3
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center gap-4 text-sm">
        <Badge variant="outline" className="gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {healthyCount} healthy
        </Badge>
        {errorCount > 0 && (
          <Badge
            variant="outline"
            className="gap-1.5 border-red-200 text-red-700"
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </Badge>
        )}
        <span className="text-muted-foreground ml-auto">
          {instances.length} connector{instances.length !== 1 ? 's' : ''} total
        </span>
      </div>

      {/* Instance Cards */}
      <div className="space-y-3">
        {instances.map((instance) => (
          <ConnectorInstanceCard
            key={instance.connectorId}
            instance={instance}
            onToggle={(enabled) => onToggle(instance.connectorId, enabled)}
            onTestConnection={() => onTestConnection(instance.connectorId)}
            onDisconnect={() => onDisconnect(instance.connectorId)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Instance Card
// ============================================================================

function ConnectorInstanceCard({
  instance,
  onToggle,
  onTestConnection,
  onDisconnect,
}: {
  instance: ConnectorInstanceData;
  onToggle: (enabled: boolean) => void;
  onTestConnection: () => void;
  onDisconnect: () => void;
}) {
  const [showDisconnect, setShowDisconnect] = React.useState(false);
  const variant = getHealthVariant(instance);
  const config = healthConfig[variant];
  const StatusIcon = config.icon;

  return (
    <Card className={cn(variant === 'error' && 'border-red-200')}>
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          {/* Health Dot */}
          <div className="mt-1">
            <span className="relative flex h-3 w-3">
              {instance.enabled && instance.healthy && (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                    config.dotClass
                  )}
                />
              )}
              <span
                className={cn(
                  'relative inline-flex h-3 w-3 rounded-full',
                  config.dotClass
                )}
              />
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{instance.connectorName}</span>
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', config.colour)}
              >
                <StatusIcon className="mr-1 h-3 w-3" />
                {config.label}
              </Badge>
            </div>

            {/* Metrics Row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(instance.lastHealthCheck)}
              </span>

              {instance.latencyMs !== undefined && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {instance.latencyMs}ms
                </span>
              )}

              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                {instance.signalCount24h} signals/24h
              </span>

              <span className="text-muted-foreground/60">
                {instance.signalCount7d} /7d
              </span>

              {instance.consecutiveFailures > 0 && (
                <span className="text-red-600">
                  {instance.consecutiveFailures} failure
                  {instance.consecutiveFailures !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Error Message */}
            {instance.lastError && variant === 'error' && (
              <div className="mt-2 rounded bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                {instance.lastError}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={instance.enabled}
              onCheckedChange={onToggle}
              aria-label={`Toggle ${instance.connectorName}`}
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={onTestConnection}
              title="Test connection"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            {showDisconnect ? (
              <div className="flex items-center gap-1">
                <Button variant="destructive" size="sm" onClick={onDisconnect}>
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDisconnect(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnect(true)}
                title="Disconnect"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export type { ConnectorInstanceData, ConnectorMonitorProps };
