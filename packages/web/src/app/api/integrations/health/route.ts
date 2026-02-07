import { DynamoDBClient } from '@agentic-pm/core/db';
import { IntegrationConfigRepository } from '@agentic-pm/core/db/repositories';
import type { IntegrationHealthConfig } from '@agentic-pm/core/db/repositories';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

/**
 * Integration health status response
 */
export interface IntegrationHealthResponse {
  integrations: IntegrationHealthConfig[];
  timestamp: string;
}

/**
 * GET /api/integrations/health
 *
 * Returns health status for all configured integrations.
 * Polled by the frontend to display integration health on the dashboard.
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Initialize repository
    const db = new DynamoDBClient();
    const integrationConfigRepo = new IntegrationConfigRepository(db);

    // Fetch all integration health configs
    const integrations = await integrationConfigRepo.getAll();

    const response: IntegrationHealthResponse = {
      integrations,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching integration health:', error);
    return NextResponse.json(
      {
        integrations: [],
        timestamp: new Date().toISOString(),
        error: 'Failed to fetch integration health',
      },
      { status: 500 }
    );
  }
}
