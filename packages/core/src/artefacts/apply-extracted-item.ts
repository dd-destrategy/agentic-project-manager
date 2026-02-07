/**
 * Apply extracted items to project artefacts
 *
 * Transforms approved extracted items from ingestion sessions into
 * proper artefact entries (RAID log items, decision log entries,
 * delivery state updates) and merges them into the existing artefacts.
 */

import { DynamoDBClient } from '../db/client.js';
import { ArtefactRepository } from '../db/repositories/artefact.js';
import type {
  ExtractedItem,
  ExtractedItemType,
} from '../db/repositories/extracted-item.js';
import type {
  RaidItem,
  Decision,
  RaidLogContent,
  DecisionLogContent,
  DeliveryStateContent,
  ArtefactType,
} from '../types/index.js';

import { mergeArtefact } from './updater.js';

// ============================================================================
// Types
// ============================================================================

export interface ApplyExtractedItemResult {
  success: boolean;
  artefactType: ArtefactType;
  itemId: string;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Default DynamoDB client instance */
let defaultDb: DynamoDBClient | null = null;

/**
 * Set the default DynamoDB client for the module
 */
export function setApplyDbClient(db: DynamoDBClient): void {
  defaultDb = db;
}

/**
 * Get or create the default DynamoDB client
 */
function getDb(db?: DynamoDBClient): DynamoDBClient {
  if (db) return db;
  if (!defaultDb) {
    defaultDb = new DynamoDBClient();
  }
  return defaultDb;
}

/**
 * Generate a short random ID with a prefix
 */
function generateId(prefix: string): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${id}`;
}

/**
 * Map extracted item priority to RAID severity
 */
function mapSeverity(
  priority: ExtractedItem['priority']
): RaidItem['severity'] {
  return priority;
}

// ============================================================================
// Transformers
// ============================================================================

/**
 * Map of extracted item types to their RAID log item types
 */
const RAID_TYPE_MAP: Partial<Record<ExtractedItemType, RaidItem['type']>> = {
  risk: 'risk',
  action_item: 'issue',
  blocker: 'issue',
  dependency: 'dependency',
  stakeholder_request: 'issue',
};

/**
 * Transform an extracted item into a RAID log item
 */
function toRaidItem(item: ExtractedItem): RaidItem {
  const now = new Date().toISOString();
  const raidType = RAID_TYPE_MAP[item.type] ?? 'issue';

  return {
    id: generateId('R'),
    type: raidType,
    title: item.title,
    description: item.content,
    severity: mapSeverity(item.priority),
    status: 'open',
    owner: 'PM',
    raisedDate: item.createdAt,
    source: 'user_added',
    lastReviewed: now,
  };
}

/**
 * Transform an extracted item into a Decision log entry
 */
function toDecision(item: ExtractedItem): Decision {
  return {
    id: generateId('DEC'),
    title: item.title,
    context: item.content,
    decision: item.title,
    rationale: item.content,
    optionsConsidered: [
      {
        option: item.title,
        pros: ['Selected option'],
        cons: [],
      },
    ],
    madeBy: 'user',
    date: item.createdAt,
    status: 'active',
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Apply an approved extracted item to the appropriate project artefact.
 *
 * Validates the item is in 'approved' status, transforms it into the
 * correct artefact entry, and merges it into the existing artefact.
 *
 * @param item - The extracted item to apply
 * @param projectId - The project ID to apply the item to
 * @param db - Optional DynamoDB client (uses default if not provided)
 * @returns Result indicating success or failure
 */
export async function applyExtractedItem(
  item: ExtractedItem,
  projectId: string,
  db?: DynamoDBClient
): Promise<ApplyExtractedItemResult> {
  // Validate status
  if (item.status !== 'approved') {
    return {
      success: false,
      artefactType: item.targetArtefact as ArtefactType,
      itemId: item.id,
      error: `Item must be in 'approved' status to apply. Current status: '${item.status}'`,
    };
  }

  // Validate projectId
  if (!projectId) {
    return {
      success: false,
      artefactType: item.targetArtefact as ArtefactType,
      itemId: item.id,
      error: 'projectId is required to apply an extracted item',
    };
  }

  const client = getDb(db);

  try {
    switch (item.targetArtefact) {
      case 'raid_log': {
        const raidItem = toRaidItem(item);
        const result = await mergeArtefact(
          {
            projectId,
            artefactType: 'raid_log',
            partialContent: { items: [raidItem] } as Partial<RaidLogContent>,
            strategy: 'merge',
            rationale: `Applied extracted item: ${item.title}`,
          },
          client
        );

        if (!result.success) {
          // If no existing artefact, create one with just this item
          if (
            result.error?.includes(
              'Cannot create artefact from partial content'
            )
          ) {
            const repo = new ArtefactRepository(client);
            const content: RaidLogContent = { items: [raidItem] };
            await repo.upsert(projectId, 'raid_log', content, {
              updatedBy: 'user',
              rationale: `Applied extracted item: ${item.title}`,
            });
            return {
              success: true,
              artefactType: 'raid_log',
              itemId: item.id,
            };
          }
          return {
            success: false,
            artefactType: 'raid_log',
            itemId: item.id,
            error: result.error,
          };
        }

        return {
          success: true,
          artefactType: 'raid_log',
          itemId: item.id,
        };
      }

      case 'decision_log': {
        const decision = toDecision(item);
        const result = await mergeArtefact(
          {
            projectId,
            artefactType: 'decision_log',
            partialContent: {
              decisions: [decision],
            } as Partial<DecisionLogContent>,
            strategy: 'merge',
            rationale: `Applied extracted decision: ${item.title}`,
          },
          client
        );

        if (!result.success) {
          if (
            result.error?.includes(
              'Cannot create artefact from partial content'
            )
          ) {
            const repo = new ArtefactRepository(client);
            const content: DecisionLogContent = { decisions: [decision] };
            await repo.upsert(projectId, 'decision_log', content, {
              updatedBy: 'user',
              rationale: `Applied extracted decision: ${item.title}`,
            });
            return {
              success: true,
              artefactType: 'decision_log',
              itemId: item.id,
            };
          }
          return {
            success: false,
            artefactType: 'decision_log',
            itemId: item.id,
            error: result.error,
          };
        }

        return {
          success: true,
          artefactType: 'decision_log',
          itemId: item.id,
        };
      }

      case 'delivery_state': {
        // status_update items add to nextActions
        const nextAction = `[Ingestion] ${item.title}`;
        const result = await mergeArtefact(
          {
            projectId,
            artefactType: 'delivery_state',
            partialContent: {
              nextActions: [nextAction],
            } as Partial<DeliveryStateContent>,
            strategy: 'merge',
            rationale: `Applied extracted status update: ${item.title}`,
          },
          client
        );

        if (!result.success) {
          if (
            result.error?.includes(
              'Cannot create artefact from partial content'
            )
          ) {
            // Cannot create a full delivery_state from a single action
            return {
              success: false,
              artefactType: 'delivery_state',
              itemId: item.id,
              error:
                'Delivery state artefact does not exist. Create it first before applying status updates.',
            };
          }
          return {
            success: false,
            artefactType: 'delivery_state',
            itemId: item.id,
            error: result.error,
          };
        }

        return {
          success: true,
          artefactType: 'delivery_state',
          itemId: item.id,
        };
      }

      case 'backlog_summary': {
        // Backlog summary items are not directly applicable from extraction
        return {
          success: false,
          artefactType: 'backlog_summary',
          itemId: item.id,
          error:
            'Backlog summary items cannot be applied directly from extraction. Use Jira sync instead.',
        };
      }

      default: {
        return {
          success: false,
          artefactType: item.targetArtefact as ArtefactType,
          itemId: item.id,
          error: `Unsupported target artefact: ${item.targetArtefact}`,
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      artefactType: item.targetArtefact as ArtefactType,
      itemId: item.id,
      error:
        error instanceof Error ? error.message : 'Unknown error during apply',
    };
  }
}
