import { AgentConfigRepository } from '@agentic-pm/core/db/repositories/agent-config';
import { EscalationRepository } from '@agentic-pm/core/db/repositories/escalation';
import type { AutonomyLevel, BudgetStatus } from '@agentic-pm/core/types';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';

/**
 * Recent decision from escalation history
 */
interface RecentDecision {
  id: string;
  title: string;
  agentRecommendation?: string;
  userDecision?: string;
  wasCorrect: boolean;
  decidedAt: string;
}

/**
 * Budget health data
 */
interface BudgetHealthData {
  dailySpend: number;
  dailyLimit: number;
  dailyPercentage: number;
  monthlySpend: number;
  monthlyLimit: number;
  monthlyPercentage: number;
  projectedMonthly: number;
  isHealthy: boolean;
  degradationTier: number;
}

/**
 * Graduation readiness assessment
 */
interface ReadinessAssessment {
  score: number; // 0-100
  state: 'ready' | 'not_ready' | 'needs_data';
  message: string;
  blockers: string[];
}

/**
 * Comprehensive graduation evidence
 */
export interface GraduationEvidenceData {
  // Current state
  currentLevel: AutonomyLevel;
  currentLevelNum: number;
  nextLevel: AutonomyLevel | null;
  nextLevelNum: number | null;

  // Confidence metrics
  spotCheckStats: {
    totalChecks: number;
    correctCount: number;
    incorrectCount: number;
    accuracyRate: number;
    lastCheckAt: string | null;
    daysSinceLastCheck: number | null;
  };

  // Performance history
  recentDecisions: RecentDecision[];

  // Budget health
  budgetHealth: BudgetHealthData;

  // Graduation readiness
  readiness: ReadinessAssessment;

  // Requirements for next level
  requirements: {
    minAccuracy: number;
    minChecks: number;
    minDaysAtLevel: number;
  };
}

/**
 * Map autonomy level to numeric level
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
function numberToAutonomyLevel(level: number): AutonomyLevel | null {
  switch (level) {
    case 1:
      return 'monitoring';
    case 2:
      return 'artefact';
    case 3:
      return 'tactical';
    default:
      return null;
  }
}

/**
 * Calculate budget health
 */
function calculateBudgetHealth(budget: BudgetStatus): BudgetHealthData {
  const dailyPercentage = (budget.dailySpendUsd / budget.dailyLimitUsd) * 100;
  const monthlyPercentage =
    (budget.monthlySpendUsd / budget.monthlyLimitUsd) * 100;

  // Project monthly spend based on current daily average
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const averageDailySpend = budget.monthlySpendUsd / Math.max(dayOfMonth, 1);
  const projectedMonthly = averageDailySpend * daysInMonth;

  const isHealthy =
    monthlyPercentage < 80 && // Under 80% of monthly budget
    budget.degradationTier === 0 && // No degradation
    projectedMonthly < budget.monthlyLimitUsd; // Projected to stay under limit

  return {
    dailySpend: budget.dailySpendUsd,
    dailyLimit: budget.dailyLimitUsd,
    dailyPercentage,
    monthlySpend: budget.monthlySpendUsd,
    monthlyLimit: budget.monthlyLimitUsd,
    monthlyPercentage,
    projectedMonthly,
    isHealthy,
    degradationTier: budget.degradationTier,
  };
}

/**
 * Calculate readiness score and assessment
 */
function calculateReadiness(
  currentLevelNum: number,
  spotCheckStats: GraduationEvidenceData['spotCheckStats'],
  budgetHealth: BudgetHealthData,
  daysSinceLastChange: number | null,
  requirements: GraduationEvidenceData['requirements']
): ReadinessAssessment {
  const blockers: string[] = [];

  // Already at max level
  if (currentLevelNum >= 3) {
    return {
      score: 100,
      state: 'ready',
      message: 'Already at maximum autonomy level',
      blockers: ['Already at maximum autonomy level (tactical)'],
    };
  }

  // Check spot check requirements
  const hasEnoughChecks = spotCheckStats.totalChecks >= requirements.minChecks;
  const hasAccuracy = spotCheckStats.accuracyRate >= requirements.minAccuracy;

  if (!hasEnoughChecks) {
    blockers.push(
      `Need ${requirements.minChecks - spotCheckStats.totalChecks} more spot checks (${spotCheckStats.totalChecks}/${requirements.minChecks})`
    );
  }

  if (!hasAccuracy) {
    blockers.push(
      `Accuracy below ${(requirements.minAccuracy * 100).toFixed(0)}% (currently ${(spotCheckStats.accuracyRate * 100).toFixed(1)}%)`
    );
  }

  // Check time at current level
  const hasBeenLongEnough =
    daysSinceLastChange === null ||
    daysSinceLastChange >= requirements.minDaysAtLevel;

  if (!hasBeenLongEnough && daysSinceLastChange !== null) {
    blockers.push(
      `Need ${requirements.minDaysAtLevel - daysSinceLastChange} more days at current level (${daysSinceLastChange}/${requirements.minDaysAtLevel})`
    );
  }

  // Check budget health
  if (!budgetHealth.isHealthy) {
    if (budgetHealth.degradationTier > 0) {
      blockers.push(
        `Budget degradation active (tier ${budgetHealth.degradationTier})`
      );
    }
    if (budgetHealth.monthlyPercentage > 80) {
      blockers.push(
        `Monthly budget at ${budgetHealth.monthlyPercentage.toFixed(0)}% (should be under 80%)`
      );
    }
  }

  // Insufficient data
  if (spotCheckStats.totalChecks === 0) {
    return {
      score: 0,
      state: 'needs_data',
      message:
        'No spot check data available yet. Agent needs to make decisions first.',
      blockers: ['No spot check history'],
    };
  }

  // Calculate score (0-100)
  let score = 0;

  // Accuracy component (40 points max)
  if (hasAccuracy) {
    score += 40;
  } else {
    score += (spotCheckStats.accuracyRate / requirements.minAccuracy) * 40;
  }

  // Sample size component (30 points max)
  if (hasEnoughChecks) {
    score += 30;
  } else {
    score += (spotCheckStats.totalChecks / requirements.minChecks) * 30;
  }

  // Time at level component (20 points max)
  if (hasBeenLongEnough) {
    score += 20;
  } else if (daysSinceLastChange !== null) {
    score += (daysSinceLastChange / requirements.minDaysAtLevel) * 20;
  } else {
    score += 20; // No change recorded, assume sufficient time
  }

  // Budget health component (10 points max)
  if (budgetHealth.isHealthy) {
    score += 10;
  } else {
    score += Math.max(0, (100 - budgetHealth.monthlyPercentage) / 10);
  }

  score = Math.min(100, Math.max(0, score));

  // Determine state
  const isReady = blockers.length === 0 && score >= 90;
  const state = isReady
    ? 'ready'
    : spotCheckStats.totalChecks < 5
      ? 'needs_data'
      : 'not_ready';

  const message = isReady
    ? `Ready to graduate to ${numberToAutonomyLevel(currentLevelNum + 1)?.toUpperCase()} level`
    : state === 'needs_data'
      ? 'Collecting performance data. Keep monitoring for now.'
      : 'Continue building confidence. Address blockers below.';

  return {
    score: Math.round(score),
    state,
    message,
    blockers,
  };
}

/**
 * GET /api/graduation/evidence
 *
 * Returns comprehensive graduation evidence including:
 * - Spot check statistics and accuracy
 * - Recent decisions and performance history
 * - Budget health and cost trends
 * - Graduation readiness assessment
 */
export async function GET() {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorised();
    }

    // Fetch data from repositories
    const dbClient = getDbClient();
    const configRepo = new AgentConfigRepository(dbClient);
    const escalationRepo = new EscalationRepository(dbClient);

    const [autonomySettings, spotCheckStats, budgetStatus, escalationsResult] =
      await Promise.all([
        configRepo.getAutonomySettings(),
        configRepo.getSpotCheckStats(),
        configRepo.getBudgetStatus(),
        escalationRepo.getPending({ limit: 20 }), // Get recent escalations
      ]);

    const currentLevel = autonomySettings.autonomyLevel;
    const currentLevelNum = autonomyLevelToNumber(currentLevel);
    const nextLevelNum = currentLevelNum < 3 ? currentLevelNum + 1 : null;
    const nextLevel = nextLevelNum ? numberToAutonomyLevel(nextLevelNum) : null;

    // Calculate days since last check
    let daysSinceLastCheck: number | null = null;
    if (spotCheckStats.lastCheckAt) {
      const lastCheck = new Date(spotCheckStats.lastCheckAt);
      const now = new Date();
      daysSinceLastCheck = Math.floor(
        (now.getTime() - lastCheck.getTime()) / (24 * 60 * 60 * 1000)
      );
    }

    // Calculate days since last level change
    let daysSinceLastChange: number | null = null;
    if (autonomySettings.lastLevelChange) {
      const lastChange = new Date(autonomySettings.lastLevelChange);
      const now = new Date();
      daysSinceLastChange = Math.floor(
        (now.getTime() - lastChange.getTime()) / (24 * 60 * 60 * 1000)
      );
    }

    // Extract recent decisions (decided escalations only)
    const recentDecisions: RecentDecision[] = escalationsResult.items
      .filter((esc) => esc.status === 'decided' && esc.decidedAt)
      .slice(0, 10)
      .map((esc) => ({
        id: esc.id,
        title: esc.title,
        agentRecommendation: esc.agentRecommendation,
        userDecision: esc.userDecision,
        wasCorrect: esc.userDecision === esc.agentRecommendation,
        decidedAt: esc.decidedAt!,
      }));

    // Calculate budget health
    const budgetHealth = calculateBudgetHealth(budgetStatus);

    // Define requirements for next level
    const requirements = {
      minAccuracy: 0.9, // 90% accuracy
      minChecks: currentLevelNum === 1 ? 10 : 20, // More checks required for higher levels
      minDaysAtLevel: currentLevelNum === 1 ? 7 : 14, // More time required for higher levels
    };

    // Calculate readiness
    const readiness = calculateReadiness(
      currentLevelNum,
      {
        totalChecks: spotCheckStats.totalChecks,
        correctCount: spotCheckStats.correctCount,
        incorrectCount: spotCheckStats.incorrectCount,
        accuracyRate: spotCheckStats.accuracyRate,
        lastCheckAt: spotCheckStats.lastCheckAt,
        daysSinceLastCheck,
      },
      budgetHealth,
      daysSinceLastChange,
      requirements
    );

    // Build response
    const evidence: GraduationEvidenceData = {
      currentLevel,
      currentLevelNum,
      nextLevel,
      nextLevelNum,
      spotCheckStats: {
        totalChecks: spotCheckStats.totalChecks,
        correctCount: spotCheckStats.correctCount,
        incorrectCount: spotCheckStats.incorrectCount,
        accuracyRate: spotCheckStats.accuracyRate,
        lastCheckAt: spotCheckStats.lastCheckAt,
        daysSinceLastCheck,
      },
      recentDecisions,
      budgetHealth,
      readiness,
      requirements,
    };

    return NextResponse.json(evidence);
  } catch (error) {
    console.error('Error fetching graduation evidence:', error);
    return internalError('Failed to fetch graduation evidence');
  }
}
