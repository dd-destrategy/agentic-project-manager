'use client';

import { Info, Plug, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { ConnectorCatalogue } from '@/components/connector-catalogue';
import type { ConnectorCatalogueItem } from '@/components/connector-catalogue';
import { ConnectorMonitor } from '@/components/connector-monitor';
import type { ConnectorInstanceData } from '@/components/connector-monitor';
import { ConnectorSetupWizard } from '@/components/connector-setup-wizard';
import type { ConnectorSetupConfig } from '@/components/connector-setup-wizard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// Connectors Page
//
// Two-tab layout:
// 1. Catalogue — browse and connect available integrations
// 2. Connected — monitor and manage active connector instances
// ============================================================================

export default function ConnectorsPage() {
  const [catalogueItems, setCatalogueItems] = React.useState<
    ConnectorCatalogueItem[]
  >([]);
  const [instances, setInstances] = React.useState<ConnectorInstanceData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Wizard dialog state
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardConfig, setWizardConfig] =
    React.useState<ConnectorSetupConfig | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = React.useState('catalogue');

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchCatalogue = React.useCallback(async () => {
    const res = await fetch('/api/connectors');
    if (!res.ok) throw new Error('Failed to fetch connectors');
    const data = await res.json();

    const items: ConnectorCatalogueItem[] = data.descriptors.map(
      (d: {
        id: string;
        name: string;
        description: string;
        category: string;
        icon: string;
        kind: string;
      }) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        category: d.category,
        icon: d.icon,
        kind: d.kind,
        connected: false,
        healthy: undefined,
      })
    );

    return items;
  }, []);

  const fetchInstances = React.useCallback(async () => {
    try {
      const res = await fetch('/api/connectors/instances');
      if (!res.ok) throw new Error('Failed to fetch instances');
      const data = await res.json();
      return (data.instances ?? []) as ConnectorInstanceData[];
    } catch {
      return [];
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogue, instanceList] = await Promise.all([
        fetchCatalogue(),
        fetchInstances(),
      ]);

      // Merge connection status into catalogue items
      const connectedIds = new Set(instanceList.map((i) => i.connectorId));
      const merged = catalogue.map((item) => ({
        ...item,
        connected: connectedIds.has(item.id),
        healthy: instanceList.find((i) => i.connectorId === item.id)?.healthy,
      }));

      setCatalogueItems(merged);
      setInstances(instanceList);
    } catch {
      setError('Failed to load connectors. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchCatalogue, fetchInstances]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleConnect = async (connectorId: string) => {
    try {
      // Fetch the full descriptor (includes credentialFields for the wizard)
      const res = await fetch(`/api/connectors/${connectorId}`);
      if (!res.ok) throw new Error('Failed to load connector details');
      const data = await res.json();
      const descriptor = data.descriptor;

      // Build wizard config from descriptor
      const authConfig = descriptor.auth?.config;
      const credentialFields = authConfig?.credentialFields ?? [];

      // Build config fields from the connector's endpoint template variables
      const configFields: ConnectorSetupConfig['configFields'] = [];
      if (
        descriptor.ingestion?.polling?.endpoint &&
        typeof descriptor.ingestion.polling.endpoint === 'string'
      ) {
        const templateVars = (
          descriptor.ingestion.polling.endpoint as string
        ).match(/\{\{(\w+)\}\}/g);
        if (templateVars) {
          for (const match of templateVars) {
            const key = match.replace(/\{\{|\}\}/g, '');
            // Skip checkpoint — it's managed by the system
            if (key === 'checkpoint') continue;
            configFields.push({
              key,
              label:
                key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
              type: 'text' as const,
              required: true,
              placeholder: `Enter ${key}`,
              helpText: `The ${key} parameter for the API endpoint.`,
            });
          }
        }
      }

      const config: ConnectorSetupConfig = {
        connectorId: descriptor.id,
        connectorName: descriptor.name,
        icon: descriptor.icon,
        credentialFields,
        configFields: configFields.length > 0 ? configFields : undefined,
      };

      setWizardConfig(config);
      setWizardOpen(true);
    } catch (err) {
      console.error('Failed to start connector setup:', err);
    }
  };

  const handleWizardComplete = async (
    _credentials: Record<string, string>,
    _parameters: Record<string, string>
  ) => {
    if (!wizardConfig) return;

    try {
      // Create the connector instance via API
      const connector = catalogueItems.find(
        (c) => c.id === wizardConfig.connectorId
      );
      const res = await fetch('/api/connectors/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorId: wizardConfig.connectorId,
          connectorName: wizardConfig.connectorName,
          icon: connector?.icon ?? 'plug',
          category: connector?.category ?? 'custom',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create instance');
      }

      // Refresh data and switch to Connected tab
      await loadAll();
      setActiveTab('connected');
    } catch (err) {
      console.error('Failed to save connector:', err);
    } finally {
      setWizardOpen(false);
      setWizardConfig(null);
    }
  };

  const handleWizardCancel = () => {
    setWizardOpen(false);
    setWizardConfig(null);
  };

  const handleTestConnectionWizard = async (
    _credentials: Record<string, string>,
    _parameters: Record<string, string>
  ): Promise<{ healthy: boolean; error?: string; latencyMs?: number }> => {
    if (!wizardConfig)
      return { healthy: false, error: 'No connector selected' };

    const res = await fetch('/api/connectors/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: wizardConfig.connectorId }),
    });

    const data = await res.json();
    return {
      healthy: data.healthy ?? false,
      error: data.error,
      latencyMs: data.latencyMs,
    };
  };

  const handleManage = (connectorId: string) => {
    // Switch to Connected tab so the user can manage the instance
    setActiveTab('connected');
    setTimeout(() => {
      const el = document.getElementById(`instance-${connectorId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleToggle = async (connectorId: string, enabled: boolean) => {
    // Optimistic update
    setInstances((prev) =>
      prev.map((i) => (i.connectorId === connectorId ? { ...i, enabled } : i))
    );

    try {
      const res = await fetch(`/api/connectors/instances/${connectorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) throw new Error('Failed to toggle connector');
    } catch (err) {
      console.error('Failed to toggle connector:', err);
      // Revert optimistic update
      setInstances((prev) =>
        prev.map((i) =>
          i.connectorId === connectorId ? { ...i, enabled: !enabled } : i
        )
      );
    }
  };

  const handleTestConnection = async (connectorId: string) => {
    try {
      const res = await fetch('/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId }),
      });

      const data = await res.json();

      // Update instance health status
      setInstances((prev) =>
        prev.map((i) =>
          i.connectorId === connectorId
            ? {
                ...i,
                healthy: data.healthy,
                lastHealthCheck: new Date().toISOString(),
                latencyMs: data.latencyMs,
                consecutiveFailures: data.healthy
                  ? 0
                  : i.consecutiveFailures + 1,
                lastError: data.error,
              }
            : i
        )
      );

      // Persist the health check via API
      await fetch(`/api/connectors/instances/${connectorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          healthy: data.healthy,
          lastHealthCheck: new Date().toISOString(),
          latencyMs: data.latencyMs,
          consecutiveFailures: data.healthy ? 0 : undefined,
        }),
      });
    } catch (err) {
      console.error('Failed to test connection:', err);
    }
  };

  const handleDisconnect = async (connectorId: string) => {
    try {
      const res = await fetch(`/api/connectors/instances/${connectorId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to disconnect');

      // Remove from local state and update catalogue
      setInstances((prev) => prev.filter((i) => i.connectorId !== connectorId));
      setCatalogueItems((prev) =>
        prev.map((c) =>
          c.id === connectorId
            ? { ...c, connected: false, healthy: undefined }
            : c
        )
      );
    } catch (err) {
      console.error('Failed to disconnect connector:', err);
    }
  };

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* Page Header with Instructions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Plug className="h-7 w-7 text-primary" />
              Connectors
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect your tools and services to automatically ingest signals
              into your project management workflow.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* User Instructions */}
        <Alert className="bg-blue-50/50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-800">
            <strong>Getting started:</strong> Browse the catalogue below and
            click <strong>Connect</strong> on any service. You will be guided
            through entering your credentials, configuring the connection, and
            testing it. Once connected, signals from that service will
            automatically flow into your triage pipeline. Use the{' '}
            <strong>Connected</strong> tab to monitor health, toggle connectors
            on/off, or disconnect services you no longer need.
          </AlertDescription>
        </Alert>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{' '}
            <Button variant="link" className="p-0 h-auto" onClick={loadAll}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="catalogue">
            Catalogue ({catalogueItems.length})
          </TabsTrigger>
          <TabsTrigger value="connected">
            Connected ({instances.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue" className="mt-6">
          <ConnectorCatalogue
            connectors={catalogueItems}
            onConnect={handleConnect}
            onManage={handleManage}
          />
        </TabsContent>

        <TabsContent value="connected" className="mt-6">
          {instances.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Plug className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <div>
                <p className="text-lg font-medium">No connectors yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Head over to the{' '}
                  <button
                    className="text-primary underline underline-offset-2"
                    onClick={() => setActiveTab('catalogue')}
                  >
                    Catalogue
                  </button>{' '}
                  to connect your first service. It only takes a minute.
                </p>
              </div>
            </div>
          ) : (
            <ConnectorMonitor
              instances={instances}
              onToggle={handleToggle}
              onTestConnection={handleTestConnection}
              onDisconnect={handleDisconnect}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Setup Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">
            Connect {wizardConfig?.connectorName ?? 'Connector'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Step-by-step wizard to configure and connect a new service.
          </DialogDescription>
          {wizardConfig && (
            <ConnectorSetupWizard
              config={wizardConfig}
              onComplete={handleWizardComplete}
              onCancel={handleWizardCancel}
              onTestConnection={handleTestConnectionWizard}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
