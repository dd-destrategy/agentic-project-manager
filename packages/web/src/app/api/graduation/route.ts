import { AgentConfigRepository } from '@agentic-pm/core/db/repositories/agent-config';
import { GraduationStateRepository } from '@agentic-pm/core/db/repositories/graduation-state';
import type { GraduationTier } from '@agentic-pm/core/db/repositories/graduation-state';
import { ProjectRepository } from '@agentic-pm/core/db/repositories/project';
import type { AutonomyLevel } from '@agentic-pm/core/types';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, validationError, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';
import { graduationRequestSchema } from '@/schemas/api';

/**
 * Graduation state for a single action type
 */
interface GraduationStateItem {
  actionType: 'email_stakeholder' | 'jira_status_change';
  consecutiveApprovals: number;
  tier: GraduationTier;
  lastApprovalAt?: string;
  lastCancellationAt?: string;
}

/**
 * Graduation evidence for the UI
 */
interface GraduationEvidence {
  currentLevel: number;
  targetLevel: number;
  actionStates: GraduationStateItem[];
  spotCheckStats: {
    totalChecks: number;
    correctCount: number;
    incorrectCount: number;
    accuracyRate: number;
    daysSinceLastCheck: number | null;
  };
  blockers: string[];
  canGraduate: boolean;
  graduationRequirements: {
    minApprovals: number;
    minAccuracyRate: number;
    currentApprovals: number;
    currentAccuracyRate: number;
  };
}

/**
 * Map autonomy level to numeric level for UI
 */
function autonomyLevelToNumber(level: AutonomyLevel): number {
  switch (level) {
    case 'monitoring':
      return 1;
    case 'artefact':
      return 2;
    case 'tactical':
      return 3;
  }
}

/**
 * Map numeric level to autonomy level
 */
function numberToAutonomyLevel(level: number): AutonomyLevel {
  switch (level) {
    case 1:
      return 'monitoring';
    case 2:
      return 'artefact';
    case 3:
      return 'tactical';
    default:
      return 'monitoring';
  }
}

/**
 * Calculate blockers based on current state
 */
function calculateBlockers(evidence: GraduationEvidence): string[] {
  const blockers: string[] = [];

  // Check approval count
  if (
    evidence.graduationRequirements.currentApprovals <
    evidence.graduationRequirements.minApprovals
  ) {
    const needed =
      evidence.graduationRequirements.minApprovals -
      evidence.graduationRequirements.currentApprovals;
    blockers.push(`Need ${needed} more consecutive approvals`);
  }

  // Check accuracy rate
  if (
    evidence.graduationRequirements.currentAccuracyRate <
    evidence.graduationRequirements.minAccuracyRate
  ) {
    const needed = (
      evidence.graduationRequirements.minAccuracyRate * 100
    ).toFixed(0);
    blockers.push(`Spot check accuracy below ${needed}%`);
  }

  // Check if at max level
  if (evidence.currentLevel >= 3) {
    blockers.push('Already at maximum autonomy level');
  }

  // Check recent cancellations
  const recentCancellation = evidence.actionStates.find((a) => {
    if (!a.lastCancellationAt) return false;
    const daysSince =
      (Date.now() - new Date(a.lastCancellationAt).getTime()) /
      (24 * 60 * 60 * 1000);
    return daysSince < 7;
  });

  if (recentCancellation) {
    blockers.push('Recent action cancellation within last 7 days');
  }

  return blockers;
}

/**
 * GET /api/graduation
 *
 * Returns the current graduation evidence including metrics,
 * blockers, and whether graduation is possible.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    // Fetch data from DynamoDB (C03: singleton)
    const dbClient = getDbClient();
    const configRepo = new AgentConfigRepository(dbClient);
    const graduationRepo = new GraduationStateRepository(dbClient);

    // Resolve project ID from query parameter or fall back to first active project
    let projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      const projectRepo = new ProjectRepository(dbClient);
      const activeProjects = await projectRepo.getActive({ limit: 1 });
      projectId = activeProjects.items[0]?.id ?? 'default';
    }

    const [autonomyLevel, spotCheckStats, actionStates] = await Promise.all([
      configRepo.getAutonomyLevel(),
      configRepo.getSpotCheckStats(),
      graduationRepo.getByProject(projectId),
    ]);

    const currentLevel = autonomyLevelToNumber(autonomyLevel);
    const targetLevel = Math.min(currentLevel + 1, 3);

    // Calculate days since last check
    let daysSinceLastCheck: number | null = null;
    if (spotCheckStats.lastCheckAt) {
      const lastCheck = new Date(spotCheckStats.lastCheckAt);
      const now = new Date();
      daysSinceLastCheck = Math.floor(
        (now.getTime() - lastCheck.getTime()) / (24 * 60 * 60 * 1000)
      );
    }

    // Calculate minimum approvals needed (minimum across all action types)
    const minApprovals =
      actionStates.length > 0
        ? Math.min(...actionStates.map((a) => a.consecutiveApprovals))
        : 0;

    // Build graduation evidence
    const evidence: GraduationEvidence = {
      currentLevel,
      targetLevel,
      actionStates: actionStates.map((state) => ({
        actionType: state.actionType,
        consecutiveApprovals: state.consecutiveApprovals,
        tier: state.tier,
        lastApprovalAt: state.lastApprovalAt,
        lastCancellationAt: state.lastCancellationAt,
      })),
      spotCheckStats: {
        totalChecks: spotCheckStats.totalChecks,
        correctCount: spotCheckStats.correctCount,
        incorrectCount: spotCheckStats.incorrectCount,
        accuracyRate: spotCheckStats.accuracyRate,
        daysSinceLastCheck,
      },
      blockers: [],
      canGraduate: false,
      graduationRequirements: {
        minApprovals: 5,
        minAccuracyRate: 0.9,
        currentApprovals: minApprovals,
        currentAccuracyRate: spotCheckStats.accuracyRate,
      },
    };

    // Recalculate blockers
    evidence.blockers = calculateBlockers(evidence);
    evidence.canGraduate = evidence.blockers.length === 0;

    return NextResponse.json(evidence);
  } catch (error) {
    console.error('Error fetching graduation evidence:', error);
    return internalError('Failed to fetch graduation evidence');
  }
}

/**
 * POST /api/graduation
 *
 * Confirms graduation to a higher autonomy level.
 * Resets spot check statistics and increments the autonomy level.
 * C05: Validated with Zod schema.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    const body = await request.json();

    // C05: Validate with Zod schema
    const parseResult = graduationRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return validationError(
        'Invalid graduation request',
        parseResult.error.flatten()
      );
    }

    const { targetLevel } = parseResult.data;

    const dbClient = getDbClient();
    const configRepo = new AgentConfigRepository(dbClient);

    // Get current level
    const currentLevel = await configRepo.getAutonomyLevel();
    const currentLevelNum = autonomyLevelToNumber(currentLevel);

    // Validate graduation is allowed
    if (currentLevelNum >= targetLevel) {
      return validationError(
        'Cannot graduate to a level at or below current level'
      );
    }

    // Update autonomy level
    const newLevel = numberToAutonomyLevel(targetLevel);
    await configRepo.setAutonomyLevel(newLevel);

    // Reset spot check statistics
    await configRepo.resetSpotCheckStats();

    return NextResponse.json({ success: true, newLevel });
  } catch (error) {
    console.error('Error confirming graduation:', error);
    return internalError('Failed to confirm graduation');
  }
}
