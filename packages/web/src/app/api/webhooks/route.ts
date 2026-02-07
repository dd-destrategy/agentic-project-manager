/**
 * API Route: /api/webhooks
 *
 * POST /api/webhooks?connectorId={id}&projectId={id}
 *
 * Universal webhook receiver. Accepts inbound webhook payloads from any
 * configured connector, verifies signatures, maps to signals, and pushes
 * into the processing pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/webhooks?connectorId=github-issues&projectId=abc-123
 *
 * Receives webhook payloads from external services.
 */
export async function POST(request: NextRequest) {
  const connectorId = request.nextUrl.searchParams.get('connectorId');
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (!connectorId || !projectId) {
    return NextResponse.json(
      { error: 'Missing connectorId or projectId query parameters' },
      { status: 400 }
    );
  }

  try {
    const body = await request.text();

    // Convert headers to plain object
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Import webhook receiver
    const { WebhookReceiver, builtinDescriptors } =
      await import('@agentic-pm/core/connectors');

    // Create receiver with static descriptor lookup for now.
    // When DynamoDB is wired, this will use the ConnectorRegistry.
    const receiver = new WebhookReceiver({
      getDescriptor: async (id: string) => {
        return builtinDescriptors.find((d) => d.id === id) ?? null;
      },
      getInstance: async (_projId: string, _connId: string) => {
        // TODO: Look up from DynamoDB via ConnectorRegistry
        // For now, return a stub instance that's enabled
        return {
          projectId: _projId,
          connectorId: _connId,
          enabled: true,
          config: {},
          healthy: true,
          consecutiveFailures: 0,
          signalCount24h: 0,
          signalCount7d: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      getCredentials: async (_arn: string) => {
        // TODO: Retrieve from Secrets Manager
        return {};
      },
    });

    const result = await receiver.processWebhook({
      connectorId,
      projectId,
      headers,
      body,
    });

    if (!result.accepted) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error?.includes('Unknown connector') ? 404 : 400 }
      );
    }

    // TODO: Push result.signals into the normalise → triage pipeline
    // via Step Functions or direct Lambda invocation

    return NextResponse.json({
      accepted: true,
      eventType: result.eventType,
      signalCount: result.signals.length,
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal webhook processing error' },
      { status: 500 }
    );
  }
}
