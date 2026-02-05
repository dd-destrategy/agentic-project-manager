/**
 * Reasoning Lambda
 *
 * Complex multi-source reasoning for signals that require deeper analysis.
 * Uses Claude Sonnet for higher-quality reasoning.
 * This Lambda has NO access to integration credentials.
 */

import type { Context } from 'aws-lambda';
import { logger, getEnv } from '../shared/context.js';
import type { TriageClassifyOutput, ReasoningOutput, ProposedAction } from '../shared/types.js';
import { DynamoDBClient } from '@agentic-pm/core/db/client';
import { ArtefactRepository } from '@agentic-pm/core/db';
import {
  performReasoning,
  requiresComplexReasoning,
  type ReasoningInput,
  type ReasoningOutput as CoreReasoningOutput,
} from '@agentic-pm/core/reasoning';
import type { ClassifiedSignal, Artefact } from '@agentic-pm/core';

// Initialise clients outside handler for connection reuse (cold start optimization)
let dbClient: DynamoDBClient | null = null;
let artefactRepo: ArtefactRepository | null = null;

function getRepositories() {
  if (!dbClient) {
    const env = getEnv();
    dbClient = new DynamoDBClient(
      { region: process.env.AWS_REGION ?? 'ap-southeast-2' },
      env.TABLE_NAME
    );
    artefactRepo = new ArtefactRepository(dbClient);
  }
  return { artefactRepo: artefactRepo! };
}

/**
 * Convert core reasoning output to proposed actions
 */
function convertToProposedActions(
  signal: ClassifiedSignal,
  reasoningOutput: CoreReasoningOutput
): ProposedAction[] {
  const actions: ProposedAction[] = [];

  // Convert proposed artefact updates to actions
  if (reasoningOutput.proposedArtefactUpdates) {
    for (const update of reasoningOutput.proposedArtefactUpdates) {
      actions.push({
        actionType: 'artefact_update',
        projectId: signal.projectId,
        details: {
          artefactType: update.artefactType,
          changes: update.changes,
        },
        rationale: update.rationale,
      });
    }
  }

  // If escalation is recommended, add an escalation action
  if (reasoningOutput.shouldEscalate) {
    actions.push({
      actionType: 'create_escalation',
      projectId: signal.projectId,
      details: {
        reason: reasoningOutput.escalationReason ?? reasoningOutput.rationale,
        sourceSignalId: signal.id,
        riskAssessment: reasoningOutput.riskAssessment,
        identifiedPatterns: reasoningOutput.identifiedPatterns,
      },
      rationale: reasoningOutput.escalationReason ?? 'Signal requires user attention',
    });
  }

  // Add notification action if significant risk identified
  if (
    reasoningOutput.riskAssessment &&
    ['critical', 'high'].includes(reasoningOutput.riskAssessment.level)
  ) {
    actions.push({
      actionType: 'notification_internal',
      projectId: signal.projectId,
      details: {
        type: 'risk_alert',
        riskLevel: reasoningOutput.riskAssessment.level,
        factors: reasoningOutput.riskAssessment.factors,
        mitigationOptions: reasoningOutput.riskAssessment.mitigationOptions,
      },
      rationale: `${reasoningOutput.riskAssessment.level} risk identified: ${reasoningOutput.riskAssessment.factors.join(', ')}`,
    });
  }

  return actions;
}

/**
 * Group signals by project for efficient artefact fetching
 */
function groupSignalsByProject(signals: ClassifiedSignal[]): Map<string, ClassifiedSignal[]> {
  const grouped = new Map<string, ClassifiedSignal[]>();

  for (const signal of signals) {
    const existing = grouped.get(signal.projectId) ?? [];
    existing.push(signal);
    grouped.set(signal.projectId, existing);
  }

  return grouped;
}

export async function handler(
  event: TriageClassifyOutput,
  context: Context
): Promise<ReasoningOutput> {
  logger.setContext(context);

  logger.info('Reasoning started', {
    signalCount: event.signals.length,
    needsComplexReasoning: event.needsComplexReasoning,
  });

  // If no complex reasoning needed, pass through directly
  if (!event.needsComplexReasoning) {
    logger.info('No complex reasoning required, passing signals through');
    return {
      signals: event.signals,
      proposedActions: [],
    };
  }

  const { artefactRepo } = getRepositories();

  // Filter signals that actually need complex reasoning
  const signalsNeedingReasoning = event.signals.filter((signal) =>
    requiresComplexReasoning(signal)
  );

  logger.info('Filtered signals for complex reasoning', {
    total: event.signals.length,
    needingReasoning: signalsNeedingReasoning.length,
  });

  // Group by project for efficient artefact fetching
  const signalsByProject = groupSignalsByProject(signalsNeedingReasoning);

  // Cache artefacts by project
  const artefactCache = new Map<string, Artefact[]>();

  const proposedActions: ProposedAction[] = [];
  let totalTokensUsed = 0;

  // Process each signal that needs complex reasoning
  for (const [projectId, projectSignals] of signalsByProject) {
    // Fetch artefacts for this project (cached)
    let artefacts = artefactCache.get(projectId);
    if (!artefacts) {
      try {
        artefacts = await artefactRepo.getAllForProject(projectId);
        artefactCache.set(projectId, artefacts);
      } catch (error) {
        logger.warn('Failed to fetch artefacts for project', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
        artefacts = [];
      }
    }

    // Get recent signals for this project (excluding current batch for context)
    const recentSignals = event.signals.filter(
      (s) => s.projectId === projectId && !projectSignals.includes(s)
    );

    // Process each signal
    for (const signal of projectSignals) {
      try {
        const reasoningInput: ReasoningInput = {
          signal,
          artefacts,
          recentSignals,
          context: {
            projectId,
            autonomyLevel: 'tactical', // Default to tactical, could be fetched from config
          },
        };

        logger.info('Performing complex reasoning for signal', {
          signalId: signal.id,
          signalType: signal.type,
          projectId,
        });

        const reasoningOutput = await performReasoning(reasoningInput);

        // Track token usage
        if (reasoningOutput.usage) {
          totalTokensUsed += reasoningOutput.usage.inputTokens + reasoningOutput.usage.outputTokens;
        }

        logger.info('Reasoning completed for signal', {
          signalId: signal.id,
          recommendedAction: reasoningOutput.recommendedAction,
          confidence: reasoningOutput.confidence,
          shouldEscalate: reasoningOutput.shouldEscalate,
        });

        // Convert reasoning output to proposed actions
        const signalActions = convertToProposedActions(signal, reasoningOutput);
        proposedActions.push(...signalActions);
      } catch (error) {
        logger.error(
          'Reasoning failed for signal',
          error instanceof Error ? error : new Error(String(error)),
          { signalId: signal.id, projectId }
        );

        // On failure, create an escalation for manual review
        proposedActions.push({
          actionType: 'create_escalation',
          projectId,
          details: {
            reason: 'Automated reasoning failed - manual review required',
            sourceSignalId: signal.id,
            error: error instanceof Error ? error.message : String(error),
          },
          rationale: 'Reasoning engine encountered an error',
        });
      }
    }
  }

  logger.info('Reasoning completed', {
    proposedActions: proposedActions.length,
    totalTokensUsed,
    projectsProcessed: signalsByProject.size,
  });

  return {
    signals: event.signals,
    proposedActions,
  };
}
