import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

/**
 * Graduation tier levels
 */
type GraduationTier = 0 | 1 | 2 | 3;

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
 * In-memory store for development/demo purposes
 * In production, this would use DynamoDB
 */
const graduationState: GraduationEvidence = {
  currentLevel: 1,
  targetLevel: 2,
  actionStates: [
    {
      actionType: 'email_stakeholder',
      consecutiveApprovals: 7,
      tier: 1,
      lastApprovalAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      actionType: 'jira_status_change',
      consecutiveApprovals: 12,
      tier: 2,
      lastApprovalAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  spotCheckStats: {
    totalChecks: 15,
    correctCount: 14,
    incorrectCount: 1,
    accuracyRate: 0.933,
    daysSinceLastCheck: 3,
  },
  blockers: [],
  canGraduate: true,
  graduationRequirements: {
    minApprovals: 5,
    minAccuracyRate: 0.9,
    currentApprovals: 7,
    currentAccuracyRate: 0.933,
  },
};

/**
 * Calculate blockers based on current state
 */
function calculateBlockers(state: GraduationEvidence): string[] {
  const blockers: string[] = [];

  // Check approval count
  if (state.graduationRequirements.currentApprovals < state.graduationRequirements.minApprovals) {
    const needed = state.graduationRequirements.minApprovals - state.graduationRequirements.currentApprovals;
    blockers.push(`Need ${needed} more consecutive approvals`);
  }

  // Check accuracy rate
  if (state.graduationRequirements.currentAccuracyRate < state.graduationRequirements.minAccuracyRate) {
    const needed = (state.graduationRequirements.minAccuracyRate * 100).toFixed(0);
    blockers.push(`Spot check accuracy below ${needed}%`);
  }

  // Check if at max level
  if (state.currentLevel >= 3) {
    blockers.push('Already at maximum autonomy level');
  }

  // Check recent cancellations
  const recentCancellation = state.actionStates.find((a) => {
    if (!a.lastCancellationAt) return false;
    const daysSince = (Date.now() - new Date(a.lastCancellationAt).getTime()) / (24 * 60 * 60 * 1000);
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
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Recalculate blockers
    graduationState.blockers = calculateBlockers(graduationState);
    graduationState.canGraduate = graduationState.blockers.length === 0;

    return NextResponse.json(graduationState);
  } catch (error) {
    console.error('Error fetching graduation evidence:', error);
    return NextResponse.json(
      { error: 'Failed to fetch graduation evidence' },
      { status: 500 }
    );
  }
}
