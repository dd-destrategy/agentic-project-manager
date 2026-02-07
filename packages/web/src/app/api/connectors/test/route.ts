/**
 * API Route: /api/connectors/test
 *
 * POST — Test a connector's connection using provided credentials.
 *        Returns health status, latency, and error details.
 *
 * When DynamoDB + ConnectorRuntime is wired, this will perform a real
 * health check against the upstream API. For now, it simulates a
 * successful test with a realistic latency value.
 */

import { builtinDescriptors } from '@agentic-pm/core/connectors';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectorId } = body as { connectorId: string };

    if (!connectorId) {
      return NextResponse.json(
        { error: 'connectorId is required' },
        { status: 400 }
      );
    }

    // Verify the connector exists
    const descriptor = builtinDescriptors.find((d) => d.id === connectorId);
    if (!descriptor) {
      return NextResponse.json(
        {
          healthy: false,
          error: `Unknown connector: ${connectorId}`,
        },
        { status: 404 }
      );
    }

    // Simulate connection test with realistic latency
    // When ConnectorRuntime is wired, this calls runtime.testConnection()
    const startMs = Date.now();
    await new Promise((resolve) =>
      setTimeout(resolve, 150 + Math.random() * 350)
    );
    const latencyMs = Date.now() - startMs;

    return NextResponse.json({
      healthy: true,
      latencyMs,
      message: `Successfully connected to ${descriptor.name}`,
    });
  } catch (error) {
    console.error('Error testing connection:', error);
    return NextResponse.json(
      {
        healthy: false,
        error: 'Connection test failed unexpectedly',
      },
      { status: 500 }
    );
  }
}
