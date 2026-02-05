/**
 * Artefact Update Lambda
 *
 * Updates PM artefacts based on classified signals and executed actions.
 * Uses Claude tool-use to generate artefact updates, validates against
 * Zod schemas, and stores with previousVersion for one-deep undo.
 */

import type {
  UpdateDeliveryStateOutput,
  UpdateRaidLogOutput,
  UpdateBacklogSummaryOutput,
  UpdateDecisionLogOutput,
  ArtefactType,
  DeliveryStateContent,
  RaidLogContent,
  BacklogSummaryContent,
  DecisionLogContent,
  ClassifiedSignal,
  Artefact,
  RaidItem,
  Decision,
} from '@agentic-pm/core';
import {
  DynamoDBClient,
  ArtefactRepository,
  createHaikuClient,
  getToolsForLambda,
  ARTEFACT_UPDATE_SYSTEM_PROMPT,
  validateArtefactContent,
} from '@agentic-pm/core';
import type { Context } from 'aws-lambda';

import { logger, getEnv } from '../shared/context.js';
import type { ExecuteOutput, ArtefactUpdateOutput } from '../shared/types.js';

// Initialise clients outside handler for connection reuse (cold start optimization)
let dbClient: DynamoDBClient | null = null;
let artefactRepo: ArtefactRepository | null = null;

function getArtefactRepository() {
  if (!dbClient) {
    const env = getEnv();
    dbClient = new DynamoDBClient({ tableName: env.TABLE_NAME });
    artefactRepo = new ArtefactRepository(dbClient);
  }
  return artefactRepo!;
}

// TODO: Consider provisioned concurrency for this Lambda in CDK if cold starts become problematic
// provisioned_concurrent_executions = 1 (costs ~$3.50/month but eliminates cold starts)

/**
 * Extended input for artefact update that includes classified signals
 */
interface ArtefactUpdateInput extends ExecuteOutput {
  /** Classified signals that need artefact updates */
  signalsForArtefactUpdate?: ClassifiedSignal[];
  /** Project IDs to update */
  projectIds?: string[];
}

/**
 * Artefact update handler
 */
export async function handler(
  event: ArtefactUpdateInput,
  context: Context
): Promise<ArtefactUpdateOutput> {
  logger.setContext(context);

  logger.info('Artefact update started', {
    executed: event.executed,
    signalCount: event.signalsForArtefactUpdate?.length ?? 0,
    projectCount: event.projectIds?.length ?? 0,
  });

  const updated: string[] = [];

  // If no signals require artefact updates, return early
  if (!event.signalsForArtefactUpdate || event.signalsForArtefactUpdate.length === 0) {
    logger.info('No signals require artefact updates');
    return { updated };
  }

  try {
    // Get repository (initialised outside handler for connection reuse)
    const artefactRepo = getArtefactRepository();

    // Get API key from environment or secrets manager
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error('ANTHROPIC_API_KEY not configured');
      return { updated };
    }

    const llmClient = createHaikuClient(apiKey);
    const tools = getToolsForLambda('artefact-update');

    // Group signals by project
    const signalsByProject = groupSignalsByProject(event.signalsForArtefactUpdate);

    // Process each project
    for (const [projectId, signals] of signalsByProject) {
      try {
        logger.info('Processing artefact updates for project', {
          projectId,
          signalCount: signals.length,
        });

        // Fetch current artefacts
        const currentArtefacts = await artefactRepo.getAllForProject(projectId);
        const artefactMap = new Map(currentArtefacts.map((a) => [a.type, a]));

        // Determine which artefacts need updates based on signals
        const artefactsToUpdate = determineArtefactsToUpdate(signals);

        if (artefactsToUpdate.size === 0) {
          logger.info('No artefacts need updates for project', { projectId });
          continue;
        }

        // Build context for LLM
        const userMessage = buildUpdatePrompt(
          projectId,
          signals,
          artefactMap,
          artefactsToUpdate
        );

        // Call Claude for each artefact type that needs updating
        for (const artefactType of artefactsToUpdate) {
          try {
            const currentArtefact = artefactMap.get(artefactType);
            const toolName = getToolNameForArtefactType(artefactType);

            const response = await llmClient.callWithTools(
              ARTEFACT_UPDATE_SYSTEM_PROMPT,
              userMessage,
              tools,
              { forceTool: toolName, maxTokens: 4096 }
            );

            if (!response.success) {
              logger.error('LLM call failed for artefact update', undefined, {
                projectId,
                artefactType,
                error: response.error,
              });
              continue;
            }

            // Process the tool output based on artefact type
            const updateResult = await processArtefactUpdate(
              artefactRepo,
              projectId,
              artefactType,
              response.data,
              currentArtefact,
              signals
            );

            if (updateResult.success) {
              updated.push(`${projectId}:${artefactType}`);
              logger.info('Artefact updated successfully', {
                projectId,
                artefactType,
                version: updateResult.version,
              });
            } else {
              logger.error('Failed to update artefact', undefined, {
                projectId,
                artefactType,
                error: updateResult.error,
              });
            }
          } catch (error) {
            logger.error(
              `Error updating ${artefactType} for project ${projectId}`,
              error instanceof Error ? error : undefined
            );
          }
        }
      } catch (error) {
        logger.error(
          `Error processing project ${projectId}`,
          error instanceof Error ? error : undefined
        );
      }
    }

    logger.info('Artefact update completed', {
      updatedCount: updated.length,
      artefacts: updated,
    });

    return { updated };
  } catch (error) {
    logger.error('Artefact update failed', error instanceof Error ? error : undefined);
    return { updated };
  }
}

/**
 * Group signals by project ID
 */
function groupSignalsByProject(
  signals: ClassifiedSignal[]
): Map<string, ClassifiedSignal[]> {
  const grouped = new Map<string, ClassifiedSignal[]>();

  for (const signal of signals) {
    const projectId = signal.projectId;
    if (!grouped.has(projectId)) {
      grouped.set(projectId, []);
    }
    grouped.get(projectId)!.push(signal);
  }

  return grouped;
}

/**
 * Determine which artefacts need updates based on signal classifications
 */
function determineArtefactsToUpdate(signals: ClassifiedSignal[]): Set<ArtefactType> {
  const artefacts = new Set<ArtefactType>();

  for (const signal of signals) {
    const classification = signal.classification;

    // Check if signal recommends artefact update
    if (classification.recommendedAction !== 'update_artefact') {
      continue;
    }

    // Map categories to artefacts
    for (const category of classification.categories) {
      switch (category) {
        case 'blocker':
        case 'risk':
          artefacts.add('raid_log');
          artefacts.add('delivery_state');
          break;
        case 'scope_change':
          artefacts.add('backlog_summary');
          artefacts.add('delivery_state');
          break;
        case 'deadline_impact':
          artefacts.add('delivery_state');
          break;
        case 'routine_update':
          artefacts.add('delivery_state');
          artefacts.add('backlog_summary');
          break;
        case 'stakeholder_communication':
          // May result in decision log entry if decision made
          break;
      }
    }
  }

  return artefacts;
}

/**
 * Get the tool name for an artefact type
 */
function getToolNameForArtefactType(type: ArtefactType): string {
  const toolNames: Record<ArtefactType, string> = {
    delivery_state: 'update_delivery_state',
    raid_log: 'update_raid_log',
    backlog_summary: 'update_backlog_summary',
    decision_log: 'update_decision_log',
  };
  return toolNames[type];
}

/**
 * Build the user prompt for artefact updates
 */
function buildUpdatePrompt(
  projectId: string,
  signals: ClassifiedSignal[],
  currentArtefacts: Map<ArtefactType, Artefact>,
  artefactsToUpdate: Set<ArtefactType>
): string {
  const parts: string[] = [];

  parts.push(`## Project ID: ${projectId}`);
  parts.push('');
  parts.push('## Signals to Process');
  parts.push('');

  for (const signal of signals) {
    parts.push(`### Signal ${signal.id}`);
    parts.push(`- **Source**: ${signal.source}`);
    parts.push(`- **Type**: ${signal.type}`);
    parts.push(`- **Summary**: ${signal.sanitisedSummary}`);
    parts.push(`- **Importance**: ${signal.classification.importance}`);
    parts.push(`- **Categories**: ${signal.classification.categories.join(', ')}`);
    parts.push(`- **Recommended Action**: ${signal.classification.recommendedAction}`);
    parts.push('');
  }

  parts.push('## Current Artefact State');
  parts.push('');

  for (const type of artefactsToUpdate) {
    const artefact = currentArtefacts.get(type);
    if (artefact) {
      parts.push(`### ${formatArtefactType(type)} (Version ${artefact.version})`);
      parts.push('```json');
      parts.push(JSON.stringify(artefact.content, null, 2));
      parts.push('```');
      parts.push('');
    } else {
      parts.push(`### ${formatArtefactType(type)} (Not yet created)`);
      parts.push('This artefact does not exist yet. Please create initial content.');
      parts.push('');
    }
  }

  parts.push('## Instructions');
  parts.push('');
  parts.push('Based on the signals above, update the relevant artefacts.');
  parts.push('Use the appropriate update tool for each artefact type.');
  parts.push('Include signal IDs in the signals_incorporated field.');

  return parts.join('\n');
}

/**
 * Format artefact type for display
 */
function formatArtefactType(type: ArtefactType): string {
  const names: Record<ArtefactType, string> = {
    delivery_state: 'Delivery State',
    raid_log: 'RAID Log',
    backlog_summary: 'Backlog Summary',
    decision_log: 'Decision Log',
  };
  return names[type];
}

/**
 * Process the artefact update from LLM tool output
 */
async function processArtefactUpdate(
  repo: ArtefactRepository,
  projectId: string,
  artefactType: ArtefactType,
  toolOutput: unknown,
  currentArtefact: Artefact | undefined,
  _signals: ClassifiedSignal[]
): Promise<{ success: boolean; version?: number; error?: string }> {
  try {
    // Convert and validate based on artefact type
    let content: DeliveryStateContent | RaidLogContent | BacklogSummaryContent | DecisionLogContent;
    let rationale: string;

    switch (artefactType) {
      case 'delivery_state': {
        const output = toolOutput as UpdateDeliveryStateOutput;
        content = convertDeliveryStateOutput(output, currentArtefact?.content as DeliveryStateContent | undefined);
        rationale = output.changes_summary;
        break;
      }
      case 'raid_log': {
        const output = toolOutput as UpdateRaidLogOutput;
        content = convertRaidLogOutput(output, currentArtefact?.content as RaidLogContent | undefined);
        rationale = output.changes_summary;
        break;
      }
      case 'backlog_summary': {
        const output = toolOutput as UpdateBacklogSummaryOutput;
        content = convertBacklogSummaryOutput(output);
        rationale = output.changes_summary;
        break;
      }
      case 'decision_log': {
        const output = toolOutput as UpdateDecisionLogOutput;
        content = convertDecisionLogOutput(output, currentArtefact?.content as DecisionLogContent | undefined);
        rationale = output.changes_summary;
        break;
      }
    }

    // Validate content against schema
    const validation = validateArtefactContent(artefactType, content);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors?.join(', ')}`,
      };
    }

    // Upsert the artefact (handles create and update with previousVersion)
    const artefact = await repo.upsert(projectId, artefactType, content, {
      updatedBy: 'agent',
      rationale,
    });

    return {
      success: true,
      version: artefact.version,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Convert LLM output to DeliveryStateContent
 */
function convertDeliveryStateOutput(
  output: UpdateDeliveryStateOutput,
  current?: DeliveryStateContent
): DeliveryStateContent {
  const c = output.content;

  return {
    overallStatus: c.overall_status,
    statusSummary: c.status_summary,
    currentSprint: c.current_sprint
      ? {
          name: c.current_sprint.name,
          startDate: c.current_sprint.start_date,
          endDate: c.current_sprint.end_date,
          goal: c.current_sprint.goal,
          progress: {
            totalPoints: c.current_sprint.progress.total_points,
            completedPoints: c.current_sprint.progress.completed_points,
            inProgressPoints: c.current_sprint.progress.in_progress_points,
            blockedPoints: c.current_sprint.progress.blocked_points,
          },
        }
      : current?.currentSprint,
    milestones: c.milestones.map((m) => ({
      name: m.name,
      dueDate: m.due_date,
      status: m.status,
      notes: m.notes,
    })),
    blockers: c.blockers.map((b) => ({
      id: b.id,
      description: b.description,
      owner: b.owner ?? 'Unassigned',
      raisedDate: b.raised_date,
      severity: b.severity,
      sourceTicket: b.source_ticket,
    })),
    keyMetrics: {
      velocityTrend: c.key_metrics.velocity_trend,
      avgCycleTimeDays: c.key_metrics.avg_cycle_time_days,
      openBlockers: c.key_metrics.open_blockers,
      activeRisks: c.key_metrics.active_risks,
    },
    nextActions: c.next_actions,
  };
}

/**
 * Convert LLM output to RaidLogContent
 */
function convertRaidLogOutput(
  output: UpdateRaidLogOutput,
  current?: RaidLogContent
): RaidLogContent {
  const now = new Date().toISOString();

  // Start with existing items
  const itemsMap = new Map<string, RaidItem>();
  if (current?.items) {
    for (const item of current.items) {
      itemsMap.set(item.id, item);
    }
  }

  // Add new items
  if (output.items_added) {
    for (const item of output.items_added) {
      itemsMap.set(item.id, {
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        severity: item.severity,
        status: item.status,
        owner: item.owner ?? 'Unassigned',
        raisedDate: item.raised_date,
        dueDate: item.due_date,
        mitigation: item.mitigation,
        source: item.source,
        sourceReference: item.source_reference,
        lastReviewed: now,
      });
    }
  }

  // Apply modifications
  if (output.items_modified) {
    for (const mod of output.items_modified) {
      const existing = itemsMap.get(mod.id);
      if (existing) {
        itemsMap.set(mod.id, {
          ...existing,
          ...convertSnakeToCamel(mod.changes),
          lastReviewed: now,
        } as RaidItem);
      }
    }
  }

  return {
    items: Array.from(itemsMap.values()),
  };
}

/**
 * Convert LLM output to BacklogSummaryContent
 */
function convertBacklogSummaryOutput(
  output: UpdateBacklogSummaryOutput
): BacklogSummaryContent {
  const c = output.content;

  return {
    source: c.source,
    lastSynced: c.last_synced,
    summary: {
      totalItems: c.summary.total_items,
      byStatus: {
        toDo: c.summary.by_status.to_do,
        inProgress: c.summary.by_status.in_progress,
        doneThisSprint: c.summary.by_status.done_this_sprint,
        blocked: c.summary.by_status.blocked,
      },
      byPriority: {
        critical: c.summary.by_priority.critical,
        high: c.summary.by_priority.high,
        medium: c.summary.by_priority.medium,
        low: c.summary.by_priority.low,
      },
    },
    highlights: c.highlights.map((h) => ({
      ticketId: h.ticket_id,
      title: h.title,
      flag: h.flag,
      detail: h.detail,
      suggestedAction: h.suggested_action,
    })),
    refinementCandidates: c.refinement_candidates.map((r) => ({
      ticketId: r.ticket_id,
      title: r.title,
      issue: r.issue,
    })),
    scopeNotes: c.scope_notes,
  };
}

/**
 * Convert LLM output to DecisionLogContent
 */
function convertDecisionLogOutput(
  output: UpdateDecisionLogOutput,
  current?: DecisionLogContent
): DecisionLogContent {
  // Start with existing decisions
  const decisionsMap = new Map<string, Decision>();
  if (current?.decisions) {
    for (const decision of current.decisions) {
      decisionsMap.set(decision.id, decision);
    }
  }

  // Add new decisions
  if (output.decisions_added) {
    for (const d of output.decisions_added) {
      decisionsMap.set(d.id, {
        id: d.id,
        title: d.title,
        context: d.context,
        optionsConsidered: d.options_considered.map((o) => ({
          option: o.option,
          pros: o.pros,
          cons: o.cons,
        })),
        decision: d.decision,
        rationale: d.rationale,
        madeBy: d.made_by,
        date: d.date,
        status: d.status,
        relatedRaidItems: d.related_raid_items,
      });
    }
  }

  // Apply modifications
  if (output.decisions_modified) {
    for (const mod of output.decisions_modified) {
      const existing = decisionsMap.get(mod.id);
      if (existing) {
        decisionsMap.set(mod.id, {
          ...existing,
          ...convertSnakeToCamel(mod.changes),
        } as Decision);
      }
    }
  }

  return {
    decisions: Array.from(decisionsMap.values()),
  };
}

/**
 * Convert snake_case object keys to camelCase
 */
function convertSnakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }

  return result;
}
