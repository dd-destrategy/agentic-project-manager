import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import type { AutonomyLevel } from '@/types';

/**
 * Autonomy settings response type
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
 * In-memory store for development/demo purposes
 * In production, this would use DynamoDB via AgentConfigRepository
 */
let autonomySettings: AutonomySettingsResponse = {
  autonomyLevel: 'monitoring',
  dryRun: false,
  lastLevelChange: undefined,
  pendingAcknowledgement: undefined,
};

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

    // TODO: Fetch real settings from DynamoDB when agent runtime is deployed
    // const db = new DynamoDBClient();
    // const configRepo = new AgentConfigRepository(db);
    // const settings = await configRepo.getAutonomySettings();

    return NextResponse.json(autonomySettings);
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
 */
export async function PATCH(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const { autonomyLevel, dryRun } = body as {
      autonomyLevel?: AutonomyLevel;
      dryRun?: boolean;
    };

    // Validate autonomy level if provided
    if (autonomyLevel !== undefined) {
      const validLevels: AutonomyLevel[] = ['monitoring', 'artefact', 'tactical'];
      if (!validLevels.includes(autonomyLevel)) {
        return NextResponse.json(
          { error: 'Invalid autonomy level. Must be: monitoring, artefact, or tactical' },
          { status: 400 }
        );
      }

      // Check if level is changing
      if (autonomyLevel !== autonomySettings.autonomyLevel) {
        const now = new Date().toISOString();

        // Create pending acknowledgement for level change
        autonomySettings.pendingAcknowledgement = {
          fromLevel: autonomySettings.autonomyLevel,
          toLevel: autonomyLevel,
          requestedAt: now,
          acknowledged: false,
        };

        autonomySettings.autonomyLevel = autonomyLevel;
        autonomySettings.lastLevelChange = now;

        // Simulate agent acknowledgement after a short delay (for demo)
        // In production, this would happen when the agent processes its next cycle
        setTimeout(() => {
          if (
            autonomySettings.pendingAcknowledgement &&
            !autonomySettings.pendingAcknowledgement.acknowledged
          ) {
            autonomySettings.pendingAcknowledgement = {
              ...autonomySettings.pendingAcknowledgement,
              acknowledged: true,
              acknowledgedAt: new Date().toISOString(),
            };
          }
        }, 5000); // 5 second simulated delay
      }
    }

    // Update dry-run mode if provided
    if (dryRun !== undefined) {
      if (typeof dryRun !== 'boolean') {
        return NextResponse.json(
          { error: 'Invalid dryRun value. Must be a boolean' },
          { status: 400 }
        );
      }
      autonomySettings.dryRun = dryRun;
    }

    // TODO: Persist to DynamoDB when agent runtime is deployed
    // const db = new DynamoDBClient();
    // const configRepo = new AgentConfigRepository(db);
    // if (autonomyLevel !== undefined) {
    //   await configRepo.setAutonomyLevel(autonomyLevel);
    // }
    // if (dryRun !== undefined) {
    //   await configRepo.setDryRun(dryRun);
    // }
    // const settings = await configRepo.getAutonomySettings();

    return NextResponse.json(autonomySettings);
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
    const { action } = body as { action?: string };

    if (action === 'acknowledge') {
      if (
        autonomySettings.pendingAcknowledgement &&
        !autonomySettings.pendingAcknowledgement.acknowledged
      ) {
        autonomySettings.pendingAcknowledgement = {
          ...autonomySettings.pendingAcknowledgement,
          acknowledged: true,
          acknowledgedAt: new Date().toISOString(),
        };
      }
    } else if (action === 'clear') {
      // Clear the acknowledgement after agent has processed it
      autonomySettings.pendingAcknowledgement = undefined;
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be: acknowledge or clear' },
        { status: 400 }
      );
    }

    return NextResponse.json(autonomySettings);
  } catch (error) {
    console.error('Error processing autonomy acknowledgement:', error);
    return NextResponse.json(
      { error: 'Failed to process acknowledgement' },
      { status: 500 }
    );
  }
}
