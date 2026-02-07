/**
 * API Route: /api/connectors
 *
 * GET  — List all connector descriptors (catalogue)
 * POST — Register a new custom connector descriptor
 */

import { builtinDescriptors } from '@agentic-pm/core/connectors';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/connectors
 *
 * Returns the full connector catalogue — built-in descriptors plus
 * any user-registered custom connectors.
 */
export async function GET() {
  try {
    // For now, return built-in descriptors statically.
    // When DynamoDB registry is wired, this will also query custom descriptors.
    const descriptors = builtinDescriptors.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      category: d.category,
      icon: d.icon,
      kind: d.kind,
      authMethod: d.auth.method,
      ingestionMode: d.ingestion.mode,
      version: d.version,
    }));

    return NextResponse.json({
      descriptors,
      total: descriptors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error listing connectors:', error);
    return NextResponse.json(
      { error: 'Failed to list connectors' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/connectors
 *
 * Register a custom connector descriptor.
 * Body: ConnectorDescriptor JSON
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with Zod schema
    const { ConnectorDescriptorSchema } =
      await import('@agentic-pm/core/connectors');
    const parsed = ConnectorDescriptorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid connector descriptor',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    // Check for ID conflicts with built-in connectors
    const existing = builtinDescriptors.find((d) => d.id === parsed.data.id);
    if (existing) {
      return NextResponse.json(
        {
          error: `Connector ID '${parsed.data.id}' conflicts with a built-in connector`,
        },
        { status: 409 }
      );
    }

    // TODO: Persist to DynamoDB via ConnectorRegistry
    // For now, return success with the validated descriptor
    return NextResponse.json(
      {
        descriptor: parsed.data,
        message: 'Connector descriptor registered',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error registering connector:', error);
    return NextResponse.json(
      { error: 'Failed to register connector' },
      { status: 500 }
    );
  }
}
