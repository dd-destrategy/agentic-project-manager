/**
 * API Route: /api/connectors/[id]
 *
 * GET — Fetch a single connector descriptor by ID (includes full auth config
 *       with credentialFields for the setup wizard)
 */

import { builtinDescriptors } from '@agentic-pm/core/connectors';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const descriptor = builtinDescriptors.find((d) => d.id === id);

    if (!descriptor) {
      return NextResponse.json(
        { error: `Connector '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ descriptor });
  } catch (error) {
    console.error('Error fetching connector:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connector' },
      { status: 500 }
    );
  }
}
