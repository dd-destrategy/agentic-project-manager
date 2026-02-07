'use client';

import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useIntegrationHealth,
  formatLastHealthCheck,
  getHealthStatusVariant,
} from '@/lib/hooks/use-integration-health';

/**
 * Status badge configuration
 */
const statusConfig = {
  healthy: {
    label: 'Healthy',
    variant: 'success' as const,
    icon: CheckCircle2,
    dotClass: 'bg-green-500',
  },
  degraded: {
    label: 'Degraded',
    variant: 'warning' as const,
    icon: AlertTriangle,
    dotClass: 'bg-yellow-500',
  },
  error: {
    label: 'Error',
    variant: 'error' as const,
    icon: AlertCircle,
    dotClass: 'bg-red-500',
  },
};

/**
 * Display name mapping for integration names
 */
const integrationDisplayNames: Record<string, string> = {
  jira: 'Jira Cloud',
  ses: 'Amazon SES',
  outlook: 'Outlook',
};

/**
 * Integration Health dashboard card
 *
 * Shows the health status of each configured integration with
 * status badges, latency, last check time, and consecutive failure count.
 */
export function IntegrationHealth() {
  const { data, isLoading, isError } = useIntegrationHealth();

  if (isLoading) {
    return <IntegrationHealthLoading />;
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <WifiOff className="h-4 w-4 text-red-500" />
            Integration Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to fetch integration health status.
          </p>
        </CardContent>
      </Card>
    );
  }

  const integrations = data.integrations;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-4 w-4" />
          Integration Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No integration health data yet. Health checks run with each agent
            cycle.
          </p>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration) => {
              const variant = getHealthStatusVariant(
                integration.healthy,
                integration.consecutiveFailures
              );
              const config = statusConfig[variant];
              const StatusIcon = config.icon;

              return (
                <div
                  key={integration.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {/* Status dot */}
                    <span className="relative flex h-2.5 w-2.5">
                      {integration.healthy && (
                        <span
                          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.dotClass}`}
                        />
                      )}
                      <span
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.dotClass}`}
                      />
                    </span>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {integrationDisplayNames[integration.name] ??
                            integration.name}
                        </span>
                        <Badge
                          variant={config.variant}
                          className="text-[10px] px-1.5 py-0"
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>
                          Last check:{' '}
                          {formatLastHealthCheck(integration.lastHealthCheck)}
                        </span>
                        {integration.latencyMs !== undefined && (
                          <span>{integration.latencyMs}ms</span>
                        )}
                        {integration.consecutiveFailures > 0 && (
                          <span className="text-red-600">
                            {integration.consecutiveFailures} consecutive
                            failure
                            {integration.consecutiveFailures !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error message if present */}
                  {integration.lastError && (
                    <span
                      className="max-w-[200px] truncate text-xs text-red-600"
                      title={integration.lastError}
                    >
                      {integration.lastError}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for integration health
 */
function IntegrationHealthLoading() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
