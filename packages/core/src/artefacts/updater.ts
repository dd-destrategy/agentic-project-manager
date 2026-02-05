/**
 * Artefact updater
 *
 * Updates artefacts with versioning, previous version tracking,
 * merge logic, and conflict resolution.
 */

import type {
  ArtefactUpdateInput,
  ArtefactUpdateResult,
  ArtefactMergeInput,
  MergeStrategy,
  ArtefactDiff,
} from './types.js';
import { validateArtefactContent } from './validator.js';
import { ArtefactRepository } from '../db/repositories/artefact.js';
import { DynamoDBClient } from '../db/client.js';
import type {
  ArtefactContent,
  ArtefactType,
  RaidLogContent,
  DecisionLogContent,
  DeliveryStateContent,
  BacklogSummaryContent,
  RaidItem,
  Decision,
  Blocker,
  Milestone,
  BacklogHighlight,
  RefinementCandidate,
} from '../types/index.js';

/** Default DynamoDB client instance */
let defaultDb: DynamoDBClient | null = null;

/**
 * Set the default DynamoDB client for the module
 */
export function setDynamoDBClient(db: DynamoDBClient): void {
  defaultDb = db;
}

/**
 * Get or create the default DynamoDB client
 */
function getDb(): DynamoDBClient {
  if (!defaultDb) {
    defaultDb = new DynamoDBClient();
  }
  return defaultDb;
}

/**
 * Update an artefact with new content
 *
 * @param input - The artefact update input
 * @param db - Optional DynamoDB client (uses default if not provided)
 * @returns Update result with version information
 */
export async function updateArtefact(
  input: ArtefactUpdateInput,
  db?: DynamoDBClient
): Promise<ArtefactUpdateResult> {
  const { projectId, artefactType, content, rationale } = input;
  const client = db ?? getDb();
  const repo = new ArtefactRepository(client);

  // Validate the content against the appropriate schema
  const validation = validateArtefactContent(artefactType, content);
  if (!validation.valid) {
    return {
      success: false,
      artefactType,
      version: 0,
      error: `Invalid content: ${validation.errors?.join(', ')}`,
    };
  }

  try {
    // Use upsert to handle both create and update cases
    // This automatically stores previousVersion
    const artefact = await repo.upsert(projectId, artefactType, content, {
      updatedBy: 'agent',
      rationale,
    });

    return {
      success: true,
      artefactType,
      version: artefact.version,
      previousVersion: artefact.previousVersion,
    };
  } catch (error) {
    return {
      success: false,
      artefactType,
      version: 0,
      error: error instanceof Error ? error.message : 'Unknown error during update',
    };
  }
}

/**
 * Merge partial updates into an existing artefact
 *
 * @param input - The merge input with partial content and strategy
 * @param db - Optional DynamoDB client
 * @returns Update result with merged content
 */
export async function mergeArtefact(
  input: ArtefactMergeInput,
  db?: DynamoDBClient
): Promise<ArtefactUpdateResult> {
  const { projectId, artefactType, partialContent, strategy = 'merge', rationale } = input;
  const client = db ?? getDb();
  const repo = new ArtefactRepository(client);

  try {
    // Fetch current artefact
    const existing = await repo.get(projectId, artefactType);

    if (!existing) {
      // If no existing artefact, validate and create new one
      // For partial content, we need to ensure it's valid as a complete artefact
      const validation = validateArtefactContent(artefactType, partialContent as ArtefactContent);
      if (!validation.valid) {
        return {
          success: false,
          artefactType,
          version: 0,
          error: `Cannot create artefact from partial content: ${validation.errors?.join(', ')}`,
        };
      }

      const artefact = await repo.upsert(projectId, artefactType, partialContent as ArtefactContent, {
        updatedBy: 'agent',
        rationale,
      });

      return {
        success: true,
        artefactType,
        version: artefact.version,
      };
    }

    // Merge the content based on strategy and artefact type
    const mergedContent = mergeContent(
      artefactType,
      existing.content,
      partialContent,
      strategy
    );

    // Validate merged content
    const validation = validateArtefactContent(artefactType, mergedContent);
    if (!validation.valid) {
      return {
        success: false,
        artefactType,
        version: existing.version,
        error: `Merged content invalid: ${validation.errors?.join(', ')}`,
      };
    }

    // Update with merged content
    const result = await repo.update(projectId, artefactType, mergedContent, {
      updatedBy: 'agent',
      rationale,
    });

    if (!result.success) {
      return {
        success: false,
        artefactType,
        version: existing.version,
        error: result.error,
      };
    }

    return {
      success: true,
      artefactType,
      version: result.artefact!.version,
      previousVersion: existing.content,
    };
  } catch (error) {
    return {
      success: false,
      artefactType,
      version: 0,
      error: error instanceof Error ? error.message : 'Unknown error during merge',
    };
  }
}

/**
 * Revert an artefact to its previous version
 *
 * @param projectId - The project ID
 * @param artefactType - The artefact type to revert
 * @param rationale - Reason for the revert
 * @param db - Optional DynamoDB client
 * @returns Update result
 */
export async function revertArtefact(
  projectId: string,
  artefactType: ArtefactType,
  rationale: string,
  db?: DynamoDBClient
): Promise<ArtefactUpdateResult> {
  const client = db ?? getDb();
  const repo = new ArtefactRepository(client);

  try {
    const result = await repo.revert(projectId, artefactType, {
      updatedBy: 'user',
      rationale,
    });

    if (!result.success) {
      return {
        success: false,
        artefactType,
        version: 0,
        error: result.error,
      };
    }

    return {
      success: true,
      artefactType,
      version: result.artefact!.version,
      previousVersion: result.artefact!.previousVersion,
    };
  } catch (error) {
    return {
      success: false,
      artefactType,
      version: 0,
      error: error instanceof Error ? error.message : 'Unknown error during revert',
    };
  }
}

/**
 * Calculate the diff between two artefact versions
 *
 * @param artefactType - The type of artefact
 * @param oldContent - The previous content
 * @param newContent - The new content
 * @returns The diff describing changes
 */
export function calculateDiff(
  artefactType: ArtefactType,
  oldContent: ArtefactContent,
  newContent: ArtefactContent
): ArtefactDiff {
  const changes: ArtefactDiff['changes'] = [];

  switch (artefactType) {
    case 'raid_log':
      diffRaidLog(oldContent as RaidLogContent, newContent as RaidLogContent, changes);
      break;
    case 'decision_log':
      diffDecisionLog(oldContent as DecisionLogContent, newContent as DecisionLogContent, changes);
      break;
    case 'delivery_state':
      diffDeliveryState(oldContent as DeliveryStateContent, newContent as DeliveryStateContent, changes);
      break;
    case 'backlog_summary':
      diffBacklogSummary(oldContent as BacklogSummaryContent, newContent as BacklogSummaryContent, changes);
      break;
  }

  return {
    artefactType,
    changes,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Merge content based on artefact type and strategy
 */
function mergeContent(
  artefactType: ArtefactType,
  existing: ArtefactContent,
  partial: Partial<ArtefactContent>,
  strategy: MergeStrategy
): ArtefactContent {
  switch (artefactType) {
    case 'raid_log':
      return mergeRaidLog(existing as RaidLogContent, partial as Partial<RaidLogContent>, strategy);
    case 'decision_log':
      return mergeDecisionLog(existing as DecisionLogContent, partial as Partial<DecisionLogContent>, strategy);
    case 'delivery_state':
      return mergeDeliveryState(existing as DeliveryStateContent, partial as Partial<DeliveryStateContent>, strategy);
    case 'backlog_summary':
      return mergeBacklogSummary(existing as BacklogSummaryContent, partial as Partial<BacklogSummaryContent>, strategy);
  }
}

/**
 * Merge RAID log content
 */
function mergeRaidLog(
  existing: RaidLogContent,
  partial: Partial<RaidLogContent>,
  strategy: MergeStrategy
): RaidLogContent {
  if (strategy === 'replace') {
    return { ...existing, ...partial };
  }

  // Merge strategy: combine items, update existing by ID
  const itemsMap = new Map<string, RaidItem>();

  // Add existing items
  for (const item of existing.items) {
    itemsMap.set(item.id, item);
  }

  // Merge/add new items
  if (partial.items) {
    for (const item of partial.items) {
      const existingItem = itemsMap.get(item.id);
      if (existingItem) {
        // Update existing item
        itemsMap.set(item.id, { ...existingItem, ...item, lastReviewed: new Date().toISOString() });
      } else {
        // Add new item
        itemsMap.set(item.id, item);
      }
    }
  }

  return {
    items: Array.from(itemsMap.values()),
  };
}

/**
 * Merge Decision log content
 */
function mergeDecisionLog(
  existing: DecisionLogContent,
  partial: Partial<DecisionLogContent>,
  strategy: MergeStrategy
): DecisionLogContent {
  if (strategy === 'replace') {
    return { ...existing, ...partial };
  }

  // Merge strategy: combine decisions, update existing by ID
  const decisionsMap = new Map<string, Decision>();

  // Add existing decisions
  for (const decision of existing.decisions) {
    decisionsMap.set(decision.id, decision);
  }

  // Merge/add new decisions
  if (partial.decisions) {
    for (const decision of partial.decisions) {
      const existingDecision = decisionsMap.get(decision.id);
      if (existingDecision) {
        // Update existing decision
        decisionsMap.set(decision.id, { ...existingDecision, ...decision });
      } else {
        // Add new decision
        decisionsMap.set(decision.id, decision);
      }
    }
  }

  return {
    decisions: Array.from(decisionsMap.values()),
  };
}

/**
 * Merge Delivery State content
 */
function mergeDeliveryState(
  existing: DeliveryStateContent,
  partial: Partial<DeliveryStateContent>,
  strategy: MergeStrategy
): DeliveryStateContent {
  if (strategy === 'replace') {
    return { ...existing, ...partial };
  }

  // Merge strategy: deep merge objects, combine arrays by ID
  const merged: DeliveryStateContent = {
    ...existing,
    overallStatus: partial.overallStatus ?? existing.overallStatus,
    statusSummary: partial.statusSummary ?? existing.statusSummary,
    nextActions: partial.nextActions ?? existing.nextActions,
  };

  // Merge current sprint if provided
  if (partial.currentSprint) {
    merged.currentSprint = existing.currentSprint
      ? {
          ...existing.currentSprint,
          ...partial.currentSprint,
          progress: {
            ...existing.currentSprint.progress,
            ...(partial.currentSprint.progress ?? {}),
          },
        }
      : partial.currentSprint;
  }

  // Merge key metrics
  if (partial.keyMetrics) {
    merged.keyMetrics = {
      ...existing.keyMetrics,
      ...partial.keyMetrics,
    };
  }

  // Merge blockers by ID
  if (partial.blockers) {
    const blockersMap = new Map<string, Blocker>();
    for (const blocker of existing.blockers) {
      blockersMap.set(blocker.id, blocker);
    }
    for (const blocker of partial.blockers) {
      blockersMap.set(blocker.id, { ...blockersMap.get(blocker.id), ...blocker });
    }
    merged.blockers = Array.from(blockersMap.values());
  }

  // Merge milestones by name
  if (partial.milestones) {
    const milestonesMap = new Map<string, Milestone>();
    for (const milestone of existing.milestones) {
      milestonesMap.set(milestone.name, milestone);
    }
    for (const milestone of partial.milestones) {
      milestonesMap.set(milestone.name, { ...milestonesMap.get(milestone.name), ...milestone });
    }
    merged.milestones = Array.from(milestonesMap.values());
  }

  return merged;
}

/**
 * Merge Backlog Summary content
 */
function mergeBacklogSummary(
  existing: BacklogSummaryContent,
  partial: Partial<BacklogSummaryContent>,
  strategy: MergeStrategy
): BacklogSummaryContent {
  if (strategy === 'replace') {
    return { ...existing, ...partial };
  }

  // Merge strategy: deep merge
  const merged: BacklogSummaryContent = {
    ...existing,
    source: partial.source ?? existing.source,
    lastSynced: partial.lastSynced ?? existing.lastSynced,
    scopeNotes: partial.scopeNotes ?? existing.scopeNotes,
  };

  // Merge summary stats
  if (partial.summary) {
    merged.summary = {
      totalItems: partial.summary.totalItems ?? existing.summary.totalItems,
      byStatus: {
        ...existing.summary.byStatus,
        ...(partial.summary.byStatus ?? {}),
      },
      byPriority: {
        ...existing.summary.byPriority,
        ...(partial.summary.byPriority ?? {}),
      },
    };
  }

  // Merge highlights by ticketId
  if (partial.highlights) {
    const highlightsMap = new Map<string, BacklogHighlight>();
    for (const highlight of existing.highlights) {
      highlightsMap.set(highlight.ticketId, highlight);
    }
    for (const highlight of partial.highlights) {
      highlightsMap.set(highlight.ticketId, { ...highlightsMap.get(highlight.ticketId), ...highlight });
    }
    merged.highlights = Array.from(highlightsMap.values());
  }

  // Merge refinement candidates by ticketId
  if (partial.refinementCandidates) {
    const candidatesMap = new Map<string, RefinementCandidate>();
    for (const candidate of existing.refinementCandidates) {
      candidatesMap.set(candidate.ticketId, candidate);
    }
    for (const candidate of partial.refinementCandidates) {
      candidatesMap.set(candidate.ticketId, { ...candidatesMap.get(candidate.ticketId), ...candidate });
    }
    merged.refinementCandidates = Array.from(candidatesMap.values());
  }

  return merged;
}

/**
 * Calculate diff for RAID log
 */
function diffRaidLog(
  oldContent: RaidLogContent,
  newContent: RaidLogContent,
  changes: ArtefactDiff['changes']
): void {
  const oldIds = new Set(oldContent.items.map((i) => i.id));
  const newIds = new Set(newContent.items.map((i) => i.id));

  // Added items
  for (const item of newContent.items) {
    if (!oldIds.has(item.id)) {
      changes.push({
        field: `items.${item.id}`,
        changeType: 'added',
        newValue: item,
      });
    }
  }

  // Removed items
  for (const item of oldContent.items) {
    if (!newIds.has(item.id)) {
      changes.push({
        field: `items.${item.id}`,
        changeType: 'removed',
        oldValue: item,
      });
    }
  }

  // Modified items
  const newItemsMap = new Map(newContent.items.map((i) => [i.id, i]));
  for (const oldItem of oldContent.items) {
    const newItem = newItemsMap.get(oldItem.id);
    if (newItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
      changes.push({
        field: `items.${oldItem.id}`,
        changeType: 'modified',
        oldValue: oldItem,
        newValue: newItem,
      });
    }
  }
}

/**
 * Calculate diff for Decision log
 */
function diffDecisionLog(
  oldContent: DecisionLogContent,
  newContent: DecisionLogContent,
  changes: ArtefactDiff['changes']
): void {
  const oldIds = new Set(oldContent.decisions.map((d) => d.id));
  const newIds = new Set(newContent.decisions.map((d) => d.id));

  // Added decisions
  for (const decision of newContent.decisions) {
    if (!oldIds.has(decision.id)) {
      changes.push({
        field: `decisions.${decision.id}`,
        changeType: 'added',
        newValue: decision,
      });
    }
  }

  // Removed decisions
  for (const decision of oldContent.decisions) {
    if (!newIds.has(decision.id)) {
      changes.push({
        field: `decisions.${decision.id}`,
        changeType: 'removed',
        oldValue: decision,
      });
    }
  }

  // Modified decisions
  const newDecisionsMap = new Map(newContent.decisions.map((d) => [d.id, d]));
  for (const oldDecision of oldContent.decisions) {
    const newDecision = newDecisionsMap.get(oldDecision.id);
    if (newDecision && JSON.stringify(oldDecision) !== JSON.stringify(newDecision)) {
      changes.push({
        field: `decisions.${oldDecision.id}`,
        changeType: 'modified',
        oldValue: oldDecision,
        newValue: newDecision,
      });
    }
  }
}

/**
 * Calculate diff for Delivery State
 */
function diffDeliveryState(
  oldContent: DeliveryStateContent,
  newContent: DeliveryStateContent,
  changes: ArtefactDiff['changes']
): void {
  // Check top-level fields
  if (oldContent.overallStatus !== newContent.overallStatus) {
    changes.push({
      field: 'overallStatus',
      changeType: 'modified',
      oldValue: oldContent.overallStatus,
      newValue: newContent.overallStatus,
    });
  }

  if (oldContent.statusSummary !== newContent.statusSummary) {
    changes.push({
      field: 'statusSummary',
      changeType: 'modified',
      oldValue: oldContent.statusSummary,
      newValue: newContent.statusSummary,
    });
  }

  // Check blockers
  const oldBlockerIds = new Set(oldContent.blockers.map((b) => b.id));
  const newBlockerIds = new Set(newContent.blockers.map((b) => b.id));

  for (const blocker of newContent.blockers) {
    if (!oldBlockerIds.has(blocker.id)) {
      changes.push({
        field: `blockers.${blocker.id}`,
        changeType: 'added',
        newValue: blocker,
      });
    }
  }

  for (const blocker of oldContent.blockers) {
    if (!newBlockerIds.has(blocker.id)) {
      changes.push({
        field: `blockers.${blocker.id}`,
        changeType: 'removed',
        oldValue: blocker,
      });
    }
  }
}

/**
 * Calculate diff for Backlog Summary
 */
function diffBacklogSummary(
  oldContent: BacklogSummaryContent,
  newContent: BacklogSummaryContent,
  changes: ArtefactDiff['changes']
): void {
  // Check summary stats
  if (JSON.stringify(oldContent.summary) !== JSON.stringify(newContent.summary)) {
    changes.push({
      field: 'summary',
      changeType: 'modified',
      oldValue: oldContent.summary,
      newValue: newContent.summary,
    });
  }

  // Check highlights
  const oldHighlightIds = new Set(oldContent.highlights.map((h) => h.ticketId));
  const newHighlightIds = new Set(newContent.highlights.map((h) => h.ticketId));

  for (const highlight of newContent.highlights) {
    if (!oldHighlightIds.has(highlight.ticketId)) {
      changes.push({
        field: `highlights.${highlight.ticketId}`,
        changeType: 'added',
        newValue: highlight,
      });
    }
  }

  for (const highlight of oldContent.highlights) {
    if (!newHighlightIds.has(highlight.ticketId)) {
      changes.push({
        field: `highlights.${highlight.ticketId}`,
        changeType: 'removed',
        oldValue: highlight,
      });
    }
  }
}
