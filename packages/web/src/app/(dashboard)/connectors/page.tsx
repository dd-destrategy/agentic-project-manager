'use client';

import * as React from 'react';

import { ConnectorCatalogue } from '@/components/connector-catalogue';
import type { ConnectorCatalogueItem } from '@/components/connector-catalogue';
import { ConnectorMonitor } from '@/components/connector-monitor';
import type { ConnectorInstanceData } from '@/components/connector-monitor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Connectors Page
 *
 * Two-tab layout:
 * 1. Catalogue — browse and connect available integrations
 * 2. Connected — monitor and manage active connector instances
 */
export default function ConnectorsPage() {
  const [catalogueItems, setCatalogueItems] = React.useState<
    ConnectorCatalogueItem[]
  >([]);
  const [instances, setInstances] = React.useState<ConnectorInstanceData[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Fetch connector catalogue on mount
  React.useEffect(() => {
    async function fetchCatalogue() {
      try {
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

        setCatalogueItems(items);
      } catch (error) {
        console.error('Failed to load connector catalogue:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCatalogue();
  }, []);

  const handleConnect = (_connectorId: string) => {
    // TODO: Open ConnectorSetupWizard in a dialog
  };

  const handleManage = (_connectorId: string) => {
    // TODO: Open connector detail/settings panel
  };

  const handleToggle = (connectorId: string, enabled: boolean) => {
    setInstances((prev) =>
      prev.map((i) => (i.connectorId === connectorId ? { ...i, enabled } : i))
    );
    // TODO: Call API to toggle connector instance
  };

  const handleTestConnection = (_connectorId: string) => {
    // TODO: Call API to test connection
  };

  const handleDisconnect = (connectorId: string) => {
    setInstances((prev) => prev.filter((i) => i.connectorId !== connectorId));
    // TODO: Call API to delete connector instance
  };

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

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="catalogue" className="w-full">
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
          <ConnectorMonitor
            instances={instances}
            onToggle={handleToggle}
            onTestConnection={handleTestConnection}
            onDisconnect={handleDisconnect}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
