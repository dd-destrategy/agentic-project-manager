'use client';

import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Settings,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * Integration status type
 */
type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending';

/**
 * Integration configuration data
 */
export interface IntegrationConfigData {
  jira: {
    status: IntegrationStatus;
    siteUrl?: string;
    projectKey?: string;
    lastSync?: string;
    errorMessage?: string;
  };
  outlook: {
    status: IntegrationStatus;
    email?: string;
    lastSync?: string;
    errorMessage?: string;
  };
  ses: {
    status: IntegrationStatus;
    fromAddress?: string;
    region?: string;
    enabled: boolean;
  };
}

/**
 * Props for IntegrationConfig component
 */
interface IntegrationConfigProps {
  config: IntegrationConfigData;
  onRefresh?: (integration: keyof IntegrationConfigData) => void;
  onToggle?: (integration: keyof IntegrationConfigData, enabled: boolean) => void;
}

/**
 * Status configuration
 */
const STATUS_CONFIG: Record<IntegrationStatus, { icon: React.ReactNode; label: string; className: string }> = {
  connected: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Connected',
    className: 'text-green-600 bg-green-50 border-green-200',
  },
  disconnected: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Disconnected',
    className: 'text-gray-600 bg-gray-50 border-gray-200',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    label: 'Error',
    className: 'text-red-600 bg-red-50 border-red-200',
  },
  pending: {
    icon: <RefreshCw className="h-4 w-4 animate-spin" />,
    label: 'Connecting...',
    className: 'text-amber-600 bg-amber-50 border-amber-200',
  },
};

/**
 * Format relative time
 */
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
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * IntegrationConfig component
 *
 * Displays and manages integration configurations for
 * Jira, Outlook, and SES.
 */
export function IntegrationConfig({ config, onRefresh, onToggle }: IntegrationConfigProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Integrations
        </CardTitle>
        <CardDescription>
          Configure connections to external services
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Jira Integration */}
        <IntegrationRow
          name="Jira Cloud"
          description="Project tracking and issue management"
          status={config.jira.status}
          details={[
            config.jira.siteUrl && { label: 'Site', value: config.jira.siteUrl },
            config.jira.projectKey && { label: 'Project', value: config.jira.projectKey },
            { label: 'Last sync', value: formatRelativeTime(config.jira.lastSync) },
          ].filter(Boolean) as Array<{ label: string; value: string }>}
          errorMessage={config.jira.errorMessage}
          onRefresh={() => onRefresh?.('jira')}
        />

        {/* Outlook Integration */}
        <IntegrationRow
          name="Microsoft Outlook"
          description="Email monitoring via Graph API"
          status={config.outlook.status}
          details={[
            config.outlook.email && { label: 'Account', value: config.outlook.email },
            { label: 'Last sync', value: formatRelativeTime(config.outlook.lastSync) },
          ].filter(Boolean) as Array<{ label: string; value: string }>}
          errorMessage={config.outlook.errorMessage}
          onRefresh={() => onRefresh?.('outlook')}
        />

        {/* SES Integration */}
        <IntegrationRow
          name="Amazon SES"
          description="Email notifications"
          status={config.ses.status}
          details={[
            config.ses.fromAddress && { label: 'From', value: config.ses.fromAddress },
            config.ses.region && { label: 'Region', value: config.ses.region },
          ].filter(Boolean) as Array<{ label: string; value: string }>}
          enabled={config.ses.enabled}
          onToggle={(enabled) => onToggle?.('ses', enabled)}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Integration row component
 */
function IntegrationRow({
  name,
  description,
  status,
  details,
  errorMessage,
  enabled,
  onRefresh,
  onToggle,
}: {
  name: string;
  description: string;
  status: IntegrationStatus;
  details: Array<{ label: string; value: string }>;
  errorMessage?: string;
  enabled?: boolean;
  onRefresh?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium">{name}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {onToggle !== undefined && (
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              aria-label={`Toggle ${name}`}
            />
          )}
          <Badge
            variant="outline"
            className={cn('flex items-center gap-1', statusConfig.className)}
          >
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        </div>
      </div>

      {/* Details */}
      {details.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          {details.map((detail) => (
            <div key={detail.label}>
              <span className="text-muted-foreground">{detail.label}: </span>
              <span className="font-medium">{detail.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="rounded bg-red-50 border border-red-200 p-2 text-sm text-red-700 mb-3">
          {errorMessage}
        </div>
      )}

      {/* Actions */}
      {onRefresh && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button variant="ghost" size="sm">
            <ExternalLink className="h-3 w-3 mr-1" />
            Configure
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact integration status for dashboard
 */
export function IntegrationStatusCompact({ config }: { config: IntegrationConfigData }) {
  const integrations = [
    { name: 'Jira', status: config.jira.status },
    { name: 'Outlook', status: config.outlook.status },
    { name: 'SES', status: config.ses.status },
  ];

  return (
    <div className="flex items-center gap-3">
      {integrations.map((integration) => {
        const statusConfig = STATUS_CONFIG[integration.status];
        return (
          <div
            key={integration.name}
            className="flex items-center gap-1 text-sm"
            title={`${integration.name}: ${statusConfig.label}`}
          >
            <span className={cn('flex items-center', statusConfig.className.split(' ')[0])}>
              {statusConfig.icon}
            </span>
            <span className="text-muted-foreground">{integration.name}</span>
          </div>
        );
      })}
    </div>
  );
}
