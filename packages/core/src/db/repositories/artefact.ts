/**
 * Artefact repository
 */

import { KEY_PREFIX } from '../../constants.js';
import type { Artefact, ArtefactContent, ArtefactType } from '../../types/index.js';
import { DynamoDBClient } from '../client.js';

/**
 * Repository for Artefact entities
 */
export class ArtefactRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a specific artefact
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
   * Create or update an artefact
   */
  async upsert(
    projectId: string,
    artefactType: ArtefactType,
    content: ArtefactContent,
    previousVersion?: ArtefactContent
  ): Promise<Artefact> {
    const existing = await this.get(projectId, artefactType);
    const now = new Date().toISOString();

    const artefact: Artefact = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId,
      type: artefactType,
      content,
      previousVersion: previousVersion ?? existing?.content,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${projectId}`,
      SK: `${KEY_PREFIX.ARTEFACT}${artefactType}`,
      ...artefact,
    });

    return artefact;
  }
}
