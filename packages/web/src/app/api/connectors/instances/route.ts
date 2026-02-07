/**
 * API Route: /api/connectors/instances
 *
 * GET  — List all connector instances for the current project
 * POST — Create a new connector instance (connect a service)
 *
 * Note: Uses in-memory store until DynamoDB registry is wired.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// In-memory instance store (replaced by DynamoDB ConnectorRegistry later)
// ---------------------------------------------------------------------------

export interface StoredInstance {
  projectId: string;
  connectorId: string;
  connectorName: string;
  icon: string;
  category: string;
  enabled: boolean;
  healthy: boolean;
  lastHealthCheck?: string;
  consecutiveFailures: number;
  signalCount24h: number;
  signalCount7d: number;
  createdAt: string;
  updatedAt: string;
}

// Singleton store — survives across requests in dev server
const instanceStore: Map<string, StoredInstance> = new Map();

export function getInstanceStore() {
  return instanceStore;
}

// ---------------------------------------------------------------------------
// GET /api/connectors/instances
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const instances = Array.from(instanceStore.values());
    return NextResponse.json({ instances, total: instances.length });
  } catch (error) {
    console.error('Error listing instances:', error);
    return NextResponse.json(
      { error: 'Failed to list instances' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/connectors/instances
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      connectorId,
      connectorName,
      icon,
      category,
    }: {
      connectorId: string;
      connectorName: string;
      icon: string;
      category: string;
    } = body;

    if (!connectorId || !connectorName) {
      return NextResponse.json(
        { error: 'connectorId and connectorName are required' },
        { status: 400 }
      );
    }

    // Check for duplicate
    if (instanceStore.has(connectorId)) {
      return NextResponse.json(
        { error: `Connector '${connectorId}' is already connected` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const instance: StoredInstance = {
      projectId: 'default',
      connectorId,
      connectorName,
      icon: icon ?? 'plug',
      category: category ?? 'custom',
      enabled: true,
      healthy: true,
      lastHealthCheck: now,
      consecutiveFailures: 0,
      signalCount24h: 0,
      signalCount7d: 0,
      createdAt: now,
      updatedAt: now,
    };

    instanceStore.set(connectorId, instance);

    return NextResponse.json({ instance }, { status: 201 });
  } catch (error) {
    console.error('Error creating instance:', error);
    return NextResponse.json(
      { error: 'Failed to create instance' },
      { status: 500 }
    );
  }
}
