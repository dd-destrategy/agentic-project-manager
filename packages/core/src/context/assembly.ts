/**
 * Context Assembly Module
 *
 * Builds cacheable prompt prefixes and variable suffixes for LLM calls.
 * Implements the cache-friendly structure from solution-design/06-prompt-library.md Section 5.
 *
 * Cache Structure:
 * - Cacheable Prefix (~80% of tokens): System prompt + project context + artefact state
 * - Variable Suffix (~20% of tokens): New signals + final instruction
 *
 * Expected cache hit rate: ~75-80% for consecutive cycles
 */

import type {
  SanitisedSignal,
  ClassifiedSignal,
  DeliveryStateContent,
  RaidLogContent,
  BacklogSummaryContent,
  DecisionLogContent,
  AgentAction,
  AutonomyLevel,
} from '../types/index.js';

/**
 * Project context for prompt assembly
 */
export interface ProjectContext {
  projectId: string;
  projectName: string;
  sourceSystem: 'jira' | 'outlook' | 'asana';
  sourceProjectKey: string;
  status: 'active' | 'paused' | 'archived';
  autonomyLevel: AutonomyLevel;
  workingHours?: {
    start: string;
    end: string;
    timezone: string;
  };
}

/**
 * Summary of current artefact state
 */
export interface ArtefactStateSummary {
  deliveryState?: {
    overallStatus: 'green' | 'amber' | 'red';
    statusSummary: string;
    openBlockers: number;
    activeRisks: number;
    currentSprint?: {
      name: string;
      progressPercent: number;
    };
    updatedAt: string;
  };
  raidLog?: {
    openRisks: number;
    criticalRisks: number;
    openIssues: number;
    activeDependencies: number;
    criticalItems: Array<{
      id: string;
      type: 'risk' | 'issue' | 'dependency';
      title: string;
      status: string;
    }>;
    updatedAt: string;
  };
  backlogSummary?: {
    totalItems: number;
    blockedCount: number;
    staleCount: number;
    refinementNeeded: number;
    updatedAt: string;
  };
  recentDecisions?: Array<{
    id: string;
    title: string;
    decision: string;
    date: string;
  }>;
}

/**
 * Historical actions summary
 */
export interface HistoricalActionsSummary {
  actions: Array<{
    timestamp: string;
    actionType: string;
    description: string;
    executed: boolean;
    confidence?: {
      sourceAgreement: number;
      boundaryCompliance: number;
      schemaValid: number;
      precedentMatch: number;
    };
  }>;
  totalActions: number;
  executedCount: number;
  pendingCount: number;
  escalatedCount: number;
}

/**
 * Assembled prompt with cache boundaries
 */
export interface AssembledPrompt {
  /** System prompt (static per Lambda type) */
  systemPrompt: string;
  /** Cacheable user message prefix */
  cacheablePrefix: string;
  /** Variable user message suffix (new each call) */
  variableSuffix: string;
  /** Estimated token counts */
  tokenEstimates: {
    systemPrompt: number;
    cacheablePrefix: number;
    variableSuffix: number;
    total: number;
  };
}

/**
 * Options for context assembly
 */
export interface AssemblyOptions {
  /** Include artefact state in context */
  includeArtefacts?: boolean;
  /** Include historical actions */
  includeActions?: boolean;
  /** Maximum signals to include */
  maxSignals?: number;
  /** Custom final instruction */
  finalInstruction?: string;
}

/**
 * Estimate token count for text (rough approximation)
 * Uses ~3.5 characters per token for English text (conservative)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Build project context block
 */
export function buildProjectContextBlock(context: ProjectContext): string {
  const parts: string[] = [
    '## Project Context',
    '',
    `**Project:** ${context.projectName}`,
    `**Source:** ${context.sourceSystem} (${context.sourceProjectKey})`,
    `**Status:** ${context.status}`,
    `**Autonomy Level:** ${context.autonomyLevel}`,
  ];

  if (context.workingHours) {
    parts.push('');
    parts.push('### Working Hours');
    parts.push(`- **Timezone:** ${context.workingHours.timezone}`);
    parts.push(`- **Hours:** ${context.workingHours.start} to ${context.workingHours.end}`);
  }

  return parts.join('\n');
}

/**
 * Build artefact state summary block
 */
export function buildArtefactStateBlock(state: ArtefactStateSummary): string {
  const parts: string[] = ['## Current Artefact State'];

  // Delivery State
  if (state.deliveryState) {
    const ds = state.deliveryState;
    parts.push('');
    parts.push(`### Delivery State (as of ${ds.updatedAt})`);
    parts.push(`- **Overall Status:** ${ds.overallStatus}`);
    parts.push(`- **Summary:** ${ds.statusSummary}`);
    parts.push(`- **Open Blockers:** ${ds.openBlockers}`);
    parts.push(`- **Active Risks:** ${ds.activeRisks}`);

    if (ds.currentSprint) {
      parts.push(`- **Current Sprint:** ${ds.currentSprint.name} (${ds.currentSprint.progressPercent}% complete)`);
    }
  }

  // RAID Log Summary
  if (state.raidLog) {
    const rl = state.raidLog;
    parts.push('');
    parts.push(`### RAID Log Summary (as of ${rl.updatedAt})`);
    parts.push(`- **Open Risks:** ${rl.openRisks} (${rl.criticalRisks} critical)`);
    parts.push(`- **Open Issues:** ${rl.openIssues}`);
    parts.push(`- **Active Dependencies:** ${rl.activeDependencies}`);

    if (rl.criticalItems.length > 0) {
      parts.push('');
      parts.push('**Critical Items:**');
      for (const item of rl.criticalItems) {
        parts.push(`- [${item.id}] ${item.type}: ${item.title} (Status: ${item.status})`);
      }
    }
  }

  // Backlog Summary
  if (state.backlogSummary) {
    const bl = state.backlogSummary;
    parts.push('');
    parts.push(`### Backlog Health (as of ${bl.updatedAt})`);
    parts.push(`- **Total Items:** ${bl.totalItems}`);
    parts.push(`- **Blocked:** ${bl.blockedCount}`);
    parts.push(`- **Stale (>7 days):** ${bl.staleCount}`);
    parts.push(`- **Missing Criteria:** ${bl.refinementNeeded}`);
  }

  // Recent Decisions
  if (state.recentDecisions && state.recentDecisions.length > 0) {
    parts.push('');
    parts.push('### Recent Decisions (last 7 days)');
    for (const decision of state.recentDecisions) {
      parts.push(`- [${decision.id}] ${decision.title} - ${decision.decision} (${decision.date})`);
    }
  }

  return parts.join('\n');
}

/**
 * Build historical actions block
 */
export function buildHistoricalActionsBlock(summary: HistoricalActionsSummary): string {
  const parts: string[] = [
    '## Recent Agent Actions (last 24 hours)',
    '',
  ];

  for (const action of summary.actions) {
    parts.push(`### ${action.timestamp}`);
    parts.push(`- **Action:** ${action.actionType}`);
    parts.push(`- **Description:** ${action.description}`);
    parts.push(`- **Executed:** ${action.executed ? 'Yes' : 'No'}`);

    if (action.confidence) {
      parts.push(`- **Confidence:** Source=${action.confidence.sourceAgreement}, Boundary=${action.confidence.boundaryCompliance}, Schema=${action.confidence.schemaValid}, Precedent=${action.confidence.precedentMatch}`);
    }
    parts.push('');
  }

  parts.push('### Action Summary');
  parts.push(`- **Total Actions:** ${summary.totalActions}`);
  parts.push(`- **Executed:** ${summary.executedCount}`);
  parts.push(`- **Pending:** ${summary.pendingCount}`);
  parts.push(`- **Escalated:** ${summary.escalatedCount}`);

  return parts.join('\n');
}

/**
 * Build signals block (variable content - not cached)
 */
export function buildSignalsBlock(
  signals: SanitisedSignal[] | ClassifiedSignal[],
  batchId?: string
): string {
  const parts: string[] = [
    '## Signals to Process',
    '',
    `**Batch ID:** ${batchId ?? 'N/A'}`,
    `**Timestamp:** ${new Date().toISOString()}`,
    `**Signal Count:** ${signals.length}`,
    '',
  ];

  signals.forEach((signal, index) => {
    parts.push('---');
    parts.push(`### Signal ${index + 1} of ${signals.length}`);
    parts.push('');
    parts.push(`**ID:** ${signal.id}`);
    parts.push(`**Source:** ${signal.source}`);
    parts.push(`**Type:** ${signal.type}`);
    parts.push(`**Timestamp:** ${signal.timestamp}`);
    parts.push('');
    parts.push('<signal_content>');
    parts.push(signal.sanitisedSummary);
    parts.push('</signal_content>');
    parts.push('');
  });

  return parts.join('\n');
}

/**
 * Assemble a complete prompt with cache boundaries
 *
 * @param systemPrompt - The system prompt for the Lambda type
 * @param projectContext - Project context information
 * @param signals - Signals to process
 * @param options - Assembly options
 * @returns Assembled prompt with cache boundaries
 */
export function assemblePrompt(
  systemPrompt: string,
  projectContext: ProjectContext,
  signals: SanitisedSignal[] | ClassifiedSignal[],
  options: AssemblyOptions & {
    artefactState?: ArtefactStateSummary;
    historicalActions?: HistoricalActionsSummary;
    batchId?: string;
  } = {}
): AssembledPrompt {
  const {
    includeArtefacts = true,
    includeActions = false,
    maxSignals = 50,
    finalInstruction = 'Now process the signals above.',
    artefactState,
    historicalActions,
    batchId,
  } = options;

  // Build cacheable prefix
  const cacheableParts: string[] = [
    buildProjectContextBlock(projectContext),
  ];

  if (includeArtefacts && artefactState) {
    cacheableParts.push('');
    cacheableParts.push(buildArtefactStateBlock(artefactState));
  }

  if (includeActions && historicalActions) {
    cacheableParts.push('');
    cacheableParts.push(buildHistoricalActionsBlock(historicalActions));
  }

  const cacheablePrefix = cacheableParts.join('\n');

  // Build variable suffix (limited signals)
  const limitedSignals = signals.slice(0, maxSignals);
  const variableParts: string[] = [
    buildSignalsBlock(limitedSignals, batchId),
    '',
    finalInstruction,
  ];

  const variableSuffix = variableParts.join('\n');

  // Calculate token estimates
  const tokenEstimates = {
    systemPrompt: estimateTokens(systemPrompt),
    cacheablePrefix: estimateTokens(cacheablePrefix),
    variableSuffix: estimateTokens(variableSuffix),
    total: 0,
  };
  tokenEstimates.total =
    tokenEstimates.systemPrompt +
    tokenEstimates.cacheablePrefix +
    tokenEstimates.variableSuffix;

  return {
    systemPrompt,
    cacheablePrefix,
    variableSuffix,
    tokenEstimates,
  };
}

/**
 * Build artefact state summary from full artefact content
 */
export function buildArtefactSummaryFromContent(
  deliveryState?: DeliveryStateContent,
  deliveryStateUpdatedAt?: string,
  raidLog?: RaidLogContent,
  raidLogUpdatedAt?: string,
  backlogSummary?: BacklogSummaryContent,
  backlogUpdatedAt?: string,
  decisions?: DecisionLogContent,
  maxDecisions = 5
): ArtefactStateSummary {
  const summary: ArtefactStateSummary = {};

  // Build delivery state summary
  if (deliveryState) {
    summary.deliveryState = {
      overallStatus: deliveryState.overallStatus,
      statusSummary: deliveryState.statusSummary,
      openBlockers: deliveryState.blockers.length,
      activeRisks: deliveryState.keyMetrics.activeRisks,
      updatedAt: deliveryStateUpdatedAt ?? new Date().toISOString(),
    };

    if (deliveryState.currentSprint) {
      const sprint = deliveryState.currentSprint;
      const progressPercent = sprint.progress.totalPoints > 0
        ? Math.round((sprint.progress.completedPoints / sprint.progress.totalPoints) * 100)
        : 0;

      summary.deliveryState.currentSprint = {
        name: sprint.name,
        progressPercent,
      };
    }
  }

  // Build RAID log summary
  if (raidLog) {
    const openRisks = raidLog.items.filter(
      (i) => i.type === 'risk' && i.status === 'open'
    );
    const criticalRisks = openRisks.filter((i) => i.severity === 'critical');
    const openIssues = raidLog.items.filter(
      (i) => i.type === 'issue' && i.status === 'open'
    );
    const activeDependencies = raidLog.items.filter(
      (i) => i.type === 'dependency' && i.status !== 'closed'
    );

    // Get critical items (critical severity, any open status)
    const criticalItems = raidLog.items
      .filter((i) => i.severity === 'critical' && i.status !== 'closed')
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        type: i.type as 'risk' | 'issue' | 'dependency',
        title: i.title,
        status: i.status,
      }));

    summary.raidLog = {
      openRisks: openRisks.length,
      criticalRisks: criticalRisks.length,
      openIssues: openIssues.length,
      activeDependencies: activeDependencies.length,
      criticalItems,
      updatedAt: raidLogUpdatedAt ?? new Date().toISOString(),
    };
  }

  // Build backlog summary
  if (backlogSummary) {
    summary.backlogSummary = {
      totalItems: backlogSummary.summary.totalItems,
      blockedCount: backlogSummary.summary.byStatus.blocked,
      staleCount: backlogSummary.highlights.filter((h) => h.flag === 'stale').length,
      refinementNeeded: backlogSummary.refinementCandidates.length,
      updatedAt: backlogUpdatedAt ?? new Date().toISOString(),
    };
  }

  // Build recent decisions
  if (decisions && decisions.decisions.length > 0) {
    // Get most recent decisions
    const sortedDecisions = [...decisions.decisions]
      .filter((d) => d.status === 'active')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, maxDecisions);

    summary.recentDecisions = sortedDecisions.map((d) => ({
      id: d.id,
      title: d.title,
      decision: d.decision,
      date: d.date,
    }));
  }

  return summary;
}

/**
 * Build historical actions summary from action records
 */
export function buildActionsSummary(
  actions: AgentAction[],
  maxActions = 10
): HistoricalActionsSummary {
  // Sort by timestamp, most recent first
  const sortedActions = [...actions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, maxActions);

  const executedCount = actions.filter((a) => a.executed).length;
  const pendingCount = actions.filter((a) => !a.executed && !a.heldUntil).length;
  const escalatedCount = actions.filter(
    (a) => a.actionType === 'escalation_created'
  ).length;

  return {
    actions: sortedActions.map((a) => ({
      timestamp: a.createdAt,
      actionType: a.actionType,
      description: a.description,
      executed: a.executed,
      confidence: a.confidence
        ? {
            sourceAgreement: a.confidence.dimensions.sourceAgreement.score,
            boundaryCompliance: a.confidence.dimensions.boundaryCompliance.score,
            schemaValid: a.confidence.dimensions.schemaValidity.score,
            precedentMatch: a.confidence.dimensions.precedentMatch.score,
          }
        : undefined,
    })),
    totalActions: actions.length,
    executedCount,
    pendingCount,
    escalatedCount,
  };
}
