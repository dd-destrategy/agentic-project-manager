import { DynamoDBClient } from '@agentic-pm/core/db';
import { AgentConfigRepository } from '@agentic-pm/core/db/repositories/agent-config';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import {
  updateAutonomySettingsSchema,
  autonomyAcknowledgeSchema,
} from '@/schemas/api';

/**
 * Create DynamoDB client and repository
 * Note: Each Lambda invocation creates a new instance, ensuring fresh state
 */
function createConfigRepository(): AgentConfigRepository {
  const dbClient = new DynamoDBClient();
  return new AgentConfigRepository(dbClient);
}

/**
 * GET /api/agent/autonomy
 *
 * Returns the current autonomy settings including level, dry-run mode,
 * and any pending acknowledgements.
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Fetch settings from DynamoDB
    const configRepo = createConfigRepository();
    const settings = await configRepo.getAutonomySettings();

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching autonomy settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch autonomy settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agent/autonomy
 *
 * Updates autonomy settings. Accepts partial updates for:
 * - autonomyLevel: 'monitoring' | 'artefact' | 'tactical'
 * - dryRun: boolean
 *
 * IMPORTANT: Autonomy level changes create a pending acknowledgement that the
 * agent must confirm during its next heartbeat cycle. This ensures the agent is
 * aware of the new autonomy level before it takes effect.
 */
export async function PATCH(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const result = updateAutonomySettingsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const { autonomyLevel, dryRun } = result.data;
    const configRepo = createConfigRepository();

    // Update autonomy level if provided
    // Note: setAutonomyLevel handles pending acknowledgement creation
    if (autonomyLevel !== undefined) {
      await configRepo.setAutonomyLevel(autonomyLevel);
    }

    // Update dry-run mode if provided
    if (dryRun !== undefined) {
      await configRepo.setDryRun(dryRun);
    }

    // Return updated settings from DynamoDB
    const settings = await configRepo.getAutonomySettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error updating autonomy settings:', error);
    return NextResponse.json(
      { error: 'Failed to update autonomy settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent/autonomy/acknowledge
 *
 * Called by the agent to acknowledge an autonomy level change.
 * This endpoint would typically be called from the Lambda function.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const result = autonomyAcknowledgeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const { action } = result.data;
    const configRepo = createConfigRepository();

    if (action === 'acknowledge') {
      // Acknowledge the pending change in DynamoDB
      await configRepo.acknowledgeAutonomyChange();
    } else if (action === 'clear') {
      // Clear the acknowledgement after agent has processed it
      await configRepo.clearPendingAcknowledgement();
    }

    // Return updated settings from DynamoDB
    const settings = await configRepo.getAutonomySettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error processing autonomy acknowledgement:', error);
    return NextResponse.json(
      { error: 'Failed to process acknowledgement' },
      { status: 500 }
    );
  }
}
