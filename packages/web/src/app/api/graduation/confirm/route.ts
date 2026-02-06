import {
  AgentConfigRepository,
  EventRepository,
} from '@agentic-pm/core/db/repositories';
import type { AutonomyLevel } from '@agentic-pm/core/types';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, validationError, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import { confirmGraduationSchema } from '@/schemas/api';

/**
 * Graduation confirmation response
 */
interface GraduationConfirmResponse {
  success: boolean;
  previousLevel: number;
  newLevel: number;
  message: string;
  graduatedAt: string;
}

/**
 * POST /api/graduation/confirm
 *
 * Confirms graduation to the next autonomy level.
 * This is a significant action that increases the agent's
 * ability to act autonomously.
 *
 * Body:
 * - targetLevel: number (2 or 3)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const body = await request.json();
    const result = confirmGraduationSchema.safeParse(body);
    if (!result.success) {
      return validationError(
        'Invalid graduation confirmation',
        result.error.flatten()
      );
    }

    const { targetLevel } = result.data;

    const db = getDbClient();
    const configRepo = new AgentConfigRepository(db);
    const eventRepo = new EventRepository(db);

    // Get current autonomy level
    const currentSettings = await configRepo.getAutonomySettings();
    const levelMap = { monitoring: 0, artefact: 1, tactical: 2 };
    const reverseMap: Record<number, AutonomyLevel> = {
      0: 'monitoring',
      1: 'artefact',
      2: 'tactical',
    };
    const currentLevel = levelMap[currentSettings.autonomyLevel] || 0;

    // Validate target level is one step up
    if (targetLevel !== currentLevel + 1) {
      return validationError(
        'Target level must be exactly one level above current level'
      );
    }

    // Update autonomy level
    const newAutonomyLevel = reverseMap[targetLevel];
    if (!newAutonomyLevel) {
      return validationError('Invalid target level');
    }

    await configRepo.setAutonomyLevel(newAutonomyLevel);

    // Reset spot check stats for new level
    await configRepo.resetSpotCheckStats();

    // Log graduation event
    const graduatedAt = new Date().toISOString();
    await eventRepo.create({
      eventType: 'autonomy_level_changed',
      severity: 'info',
      summary: `Agent graduated from Level ${currentLevel} to Level ${targetLevel}`,
      detail: {
        context: {
          previousLevel: currentLevel,
          newLevel: targetLevel,
          graduatedBy: session.user?.email,
        },
      },
    });

    const response: GraduationConfirmResponse = {
      success: true,
      previousLevel: currentLevel,
      newLevel: targetLevel,
      message: `Successfully graduated from Level ${currentLevel} to Level ${targetLevel}`,
      graduatedAt,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error confirming graduation:', error);
    return internalError('Failed to confirm graduation');
  }
}
