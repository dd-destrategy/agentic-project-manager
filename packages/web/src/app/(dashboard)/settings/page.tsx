'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AutonomyDial } from '@/components/autonomy-dial';
import {
  Shield,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutonomyLevel } from '@/types';

/**
 * Autonomy settings response from API
 */
interface AutonomySettingsResponse {
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  lastLevelChange?: string;
  pendingAcknowledgement?: {
    fromLevel: AutonomyLevel;
    toLevel: AutonomyLevel;
    requestedAt: string;
    acknowledged: boolean;
    acknowledgedAt?: string;
  };
}

/**
 * Fetch autonomy settings from API
 */
async function fetchAutonomySettings(): Promise<AutonomySettingsResponse> {
  const response = await fetch('/api/agent/autonomy');

  if (!response.ok) {
    throw new Error('Failed to fetch autonomy settings');
  }

  return response.json();
}

/**
 * Update autonomy settings via API
 */
async function updateAutonomySettings(
  settings: Partial<{ autonomyLevel: AutonomyLevel; dryRun: boolean }>
): Promise<AutonomySettingsResponse> {
  const response = await fetch('/api/agent/autonomy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error('Failed to update autonomy settings');
  }

  return response.json();
}

/**
 * Settings Page
 *
 * Allows the user to configure agent autonomy level and dry-run mode.
 */
export default function SettingsPage() {
  const queryClient = useQueryClient();

  // Fetch current settings
  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['agent', 'autonomy'],
    queryFn: fetchAutonomySettings,
    staleTime: 30 * 1000,
  });

  // Mutation for updating settings
  const mutation = useMutation({
    mutationFn: updateAutonomySettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['agent', 'autonomy'], data);
    },
  });

  // Handlers
  const handleAutonomyChange = (level: AutonomyLevel) => {
    mutation.mutate({ autonomyLevel: level });
  };

  const handleDryRunToggle = () => {
    if (settings) {
      mutation.mutate({ dryRun: !settings.dryRun });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error loading settings</AlertTitle>
        <AlertDescription>
          Failed to load autonomy settings. Please try again.
          <Button variant="link" className="ml-2 p-0" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure agent behaviour and autonomy levels
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Pending Acknowledgement Alert */}
      {settings?.pendingAcknowledgement && !settings.pendingAcknowledgement.acknowledged && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Autonomy change pending</AlertTitle>
          <AlertDescription>
            The agent is transitioning from{' '}
            <strong>{settings.pendingAcknowledgement.fromLevel}</strong> to{' '}
            <strong>{settings.pendingAcknowledgement.toLevel}</strong> mode. The agent will
            acknowledge this change on its next cycle.
          </AlertDescription>
        </Alert>
      )}

      {/* Acknowledged Alert */}
      {settings?.pendingAcknowledgement?.acknowledged && (
        <Alert variant="success">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Autonomy change acknowledged</AlertTitle>
          <AlertDescription>
            The agent acknowledged the change to{' '}
            <strong>{settings.pendingAcknowledgement.toLevel}</strong> mode at{' '}
            {new Date(settings.pendingAcknowledgement.acknowledgedAt!).toLocaleString('en-GB')}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Autonomy Level Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Autonomy Level
            </CardTitle>
            <CardDescription>
              Control how much the agent can do autonomously without your approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AutonomyDial
              value={settings?.autonomyLevel ?? 'monitoring'}
              onChange={handleAutonomyChange}
              disabled={mutation.isPending}
              showWarning
            />

            {settings?.lastLevelChange && (
              <p className="mt-4 text-xs text-muted-foreground">
                Last changed:{' '}
                {new Date(settings.lastLevelChange).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dry Run Mode Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {settings?.dryRun ? (
                <ToggleRight className="h-5 w-5 text-amber-600" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
              Dry-Run Mode
            </CardTitle>
            <CardDescription>
              When enabled, the agent logs what it would do but does not execute actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Toggle Button */}
            <button
              type="button"
              onClick={handleDryRunToggle}
              disabled={mutation.isPending}
              className={cn(
                'relative inline-flex h-10 w-20 items-center rounded-full transition-colors',
                settings?.dryRun ? 'bg-amber-500' : 'bg-muted',
                mutation.isPending && 'cursor-not-allowed opacity-50'
              )}
            >
              <span
                className={cn(
                  'inline-block h-8 w-8 transform rounded-full bg-white shadow-md transition-transform',
                  settings?.dryRun ? 'translate-x-11' : 'translate-x-1'
                )}
              />
            </button>

            {/* Status Description */}
            <div
              className={cn(
                'rounded-lg border p-4',
                settings?.dryRun
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-green-200 bg-green-50'
              )}
            >
              {settings?.dryRun ? (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">Dry-Run Active</h4>
                    <p className="mt-1 text-sm text-amber-700">
                      The agent is in simulation mode. All actions are logged but not executed.
                      Check the activity feed to see what the agent would do.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-green-800">Live Mode</h4>
                    <p className="mt-1 text-sm text-green-700">
                      The agent will execute actions according to your autonomy level settings.
                      Actions in the hold queue require your review.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Autonomy Level Details */}
      <Card>
        <CardHeader>
          <CardTitle>What each level allows</CardTitle>
          <CardDescription>
            A breakdown of agent capabilities at each autonomy level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <AutonomyLevelDetail
              level="monitoring"
              title="Level 1: Observe"
              capabilities={[
                'Log heartbeats and observations',
                'Detect signals from Jira and Outlook',
                'Create escalations for your review',
              ]}
              restrictions={[
                'Cannot update artefacts',
                'Cannot send notifications',
                'Cannot make any changes to Jira',
              ]}
            />

            <AutonomyLevelDetail
              level="artefact"
              title="Level 2: Maintain"
              capabilities={[
                'Everything in Level 1',
                'Update RAID log, delivery state, and other artefacts',
                'Send internal SES notifications',
              ]}
              restrictions={[
                'Cannot send stakeholder emails',
                'Cannot update Jira ticket status',
                'Jira comments still require approval',
              ]}
            />

            <AutonomyLevelDetail
              level="tactical"
              title="Level 3: Act"
              capabilities={[
                'Everything in Level 2',
                'Post comments on Jira tickets',
                'Send stakeholder emails (via 30-min hold queue)',
                'Update Jira status (via 30-min hold queue)',
              ]}
              restrictions={[
                'Cannot create new Jira tickets',
                'Cannot send external emails',
                'Cannot make scope or milestone changes',
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Autonomy level detail component
 */
function AutonomyLevelDetail({
  level,
  title,
  capabilities,
  restrictions,
}: {
  level: AutonomyLevel;
  title: string;
  capabilities: string[];
  restrictions: string[];
}) {
  const colorMap = {
    monitoring: 'border-blue-200 bg-blue-50/50',
    artefact: 'border-amber-200 bg-amber-50/50',
    tactical: 'border-green-200 bg-green-50/50',
  };

  return (
    <div className={cn('rounded-lg border p-4', colorMap[level])}>
      <h4 className="font-medium">{title}</h4>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h5 className="text-sm font-medium text-green-700">Can do:</h5>
          <ul className="mt-1 space-y-1">
            {capabilities.map((cap) => (
              <li key={cap} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                {cap}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-sm font-medium text-red-700">Cannot do:</h5>
          <ul className="mt-1 space-y-1">
            {restrictions.map((res) => (
              <li key={res} className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                {res}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
