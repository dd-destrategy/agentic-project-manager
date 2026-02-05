/**
 * Artefact repository
 *
 * CRUD operations for PM artefacts with version history support.
 * Implements one-deep undo via previousVersion attribute.
 */

import { KEY_PREFIX } from '../../constants.js';
import type {
  Artefact,
  ArtefactContent,
  ArtefactType,
} from '../../types/index.js';
import { DynamoDBClient } from '../client.js';

/**
 * Result of an artefact operation
 */
export interface ArtefactOperationResult {
  success: boolean;
  artefact?: Artefact;
  error?: string;
}

/**
 * Options for updating an artefact
 */
export interface ArtefactUpdateOptions {
  /** Who triggered the update (agent or user) */
  updatedBy: 'agent' | 'user';
  /** Rationale for the update */
  rationale?: string;
}

/**
 * Repository for Artefact entities
 *
 * Handles storage and retrieval of PM artefacts:
 * - Delivery State
 * - RAID Log
 * - Backlog Summary
 * - Decision Log
 */
export class ArtefactRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a specific artefact by project and type
   */
  async get(
    projectId: string,
    artefactType: ArtefactType
  ): Promise<Artefact | null> {
    return this.db.get<Artefact>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.ARTEFACT}${artefactType}`
    );
  }

  /**
   * Get all artefacts for a project
   */
  async getAllForProject(projectId: string): Promise<Artefact[]> {
    const result = await this.db.query<Artefact>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      KEY_PREFIX.ARTEFACT
    );

    return result.items;
  }

  /**
   * Create a new artefact (fails if it already exists)
   */
  async create(
    projectId: string,
    artefactType: ArtefactType,
    content: ArtefactContent,
    options: ArtefactUpdateOptions
  ): Promise<ArtefactOperationResult> {
    const existing = await this.get(projectId, artefactType);

    if (existing) {
      return {
        success: false,
        error: `Artefact ${artefactType} already exists for project ${projectId}. Use update instead.`,
      };
    }

    const now = new Date().toISOString();
    const artefact: Artefact & { updatedBy: string; rationale?: string } = {
      id: crypto.randomUUID(),
      projectId,
      type: artefactType,
      content,
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: options.updatedBy,
      rationale: options.rationale,
    };

    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${projectId}`,
      SK: `${KEY_PREFIX.ARTEFACT}${artefactType}`,
      ...artefact,
    });

    return { success: true, artefact };
  }

  /**
   * Update an existing artefact with previous version tracking
   *
   * Stores the current content as previousVersion before applying the update.
   * This enables one-deep undo functionality.
   */
  async update(
    projectId: string,
    artefactType: ArtefactType,
    content: ArtefactContent,
    options: ArtefactUpdateOptions
  ): Promise<ArtefactOperationResult> {
    const existing = await this.get(projectId, artefactType);

    if (!existing) {
      return {
        success: false,
        error: `Artefact ${artefactType} does not exist for project ${projectId}. Use create instead.`,
      };
    }

    const now = new Date().toISOString();

    // Store current content as previousVersion for one-deep undo
    const artefact: Artefact & { updatedBy: string; rationale?: string } = {
      id: existing.id,
      projectId,
      type: artefactType,
      content,
      previousVersion: existing.content,
      version: existing.version + 1,
      createdAt: existing.createdAt,
      updatedAt: now,
      updatedBy: options.updatedBy,
      rationale: options.rationale,
    };

    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${projectId}`,
      SK: `${KEY_PREFIX.ARTEFACT}${artefactType}`,
      ...artefact,
    });

    return { success: true, artefact };
  }

  /**
   * Create or update an artefact (upsert)
   *
   * Convenience method that creates if not exists, updates otherwise.
   */
  async upsert(
    projectId: string,
    artefactType: ArtefactType,
    content: ArtefactContent,
    options: ArtefactUpdateOptions
  ): Promise<Artefact> {
    const existing = await this.get(projectId, artefactType);
    const now = new Date().toISOString();

    const artefact: Artefact & { updatedBy: string; rationale?: string } = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId,
      type: artefactType,
      content,
      previousVersion: existing?.content,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      updatedBy: options.updatedBy,
      rationale: options.rationale,
    };

    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${projectId}`,
      SK: `${KEY_PREFIX.ARTEFACT}${artefactType}`,
      ...artefact,
    });

    return artefact;
  }

  /**
   * Revert an artefact to its previous version
   *
   * Swaps content and previousVersion, enabling one-deep undo.
   * After revert, the current version becomes the previousVersion.
   */
  async revert(
    projectId: string,
    artefactType: ArtefactType,
    options: ArtefactUpdateOptions
  ): Promise<ArtefactOperationResult> {
    const existing = await this.get(projectId, artefactType);

    if (!existing) {
      return {
        success: false,
        error: `Artefact ${artefactType} does not exist for project ${projectId}.`,
      };
    }

    if (!existing.previousVersion) {
      return {
        success: false,
        error: `Artefact ${artefactType} has no previous version to revert to.`,
      };
    }

    const now = new Date().toISOString();

    // Swap content and previousVersion
    const artefact: Artefact & { updatedBy: string; rationale?: string } = {
      id: existing.id,
      projectId,
      type: artefactType,
      content: existing.previousVersion,
      previousVersion: existing.content,
      version: existing.version + 1,
      createdAt: existing.createdAt,
      updatedAt: now,
      updatedBy: options.updatedBy,
      rationale: options.rationale ?? 'Reverted to previous version',
    };

    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${projectId}`,
      SK: `${KEY_PREFIX.ARTEFACT}${artefactType}`,
      ...artefact,
    });

    return { success: true, artefact };
  }

  /**
   * Delete an artefact
   */
  async delete(
    projectId: string,
    artefactType: ArtefactType
  ): Promise<ArtefactOperationResult> {
    const existing = await this.get(projectId, artefactType);

    if (!existing) {
      return {
        success: false,
        error: `Artefact ${artefactType} does not exist for project ${projectId}.`,
      };
    }

    await this.db.delete(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${KEY_PREFIX.ARTEFACT}${artefactType}`
    );

    return { success: true, artefact: existing };
  }

  /**
   * Bootstrap all artefacts for a new project
   *
   * Creates empty artefacts for all four types.
   */
  async bootstrapForProject(
    projectId: string,
    options: ArtefactUpdateOptions
  ): Promise<Artefact[]> {
    const artefactTypes: ArtefactType[] = [
      'delivery_state',
      'raid_log',
      'backlog_summary',
      'decision_log',
    ];

    const now = new Date().toISOString();
    const artefacts: Artefact[] = [];

    for (const type of artefactTypes) {
      const content = this.getEmptyContent(type);
      const artefact: Artefact & { updatedBy: string; rationale?: string } = {
        id: crypto.randomUUID(),
        projectId,
        type,
        content,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: options.updatedBy,
        rationale: options.rationale ?? 'Initial artefact creation',
      };

      await this.db.put({
        PK: `${KEY_PREFIX.PROJECT}${projectId}`,
        SK: `${KEY_PREFIX.ARTEFACT}${type}`,
        ...artefact,
      });

      artefacts.push(artefact);
    }

    return artefacts;
  }

  /**
   * Get empty content for an artefact type
   */
  private getEmptyContent(type: ArtefactType): ArtefactContent {
    switch (type) {
      case 'delivery_state':
        return {
          overallStatus: 'green',
          statusSummary: 'Project initialised. Awaiting data from integrations.',
          milestones: [],
          blockers: [],
          keyMetrics: {
            velocityTrend: 'stable',
            avgCycleTimeDays: 0,
            openBlockers: 0,
            activeRisks: 0,
          },
          nextActions: [],
        };
      case 'raid_log':
        return {
          items: [],
        };
      case 'backlog_summary':
        return {
          source: 'jira',
          lastSynced: new Date().toISOString(),
          summary: {
            totalItems: 0,
            byStatus: {
              toDo: 0,
              inProgress: 0,
              doneThisSprint: 0,
              blocked: 0,
            },
            byPriority: {
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
            },
          },
          highlights: [],
          refinementCandidates: [],
        };
      case 'decision_log':
        return {
          decisions: [],
        };
    }
  }
}
