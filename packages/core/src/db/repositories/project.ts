/**
 * Project repository
 */

import { KEY_PREFIX, GSI1_PREFIX } from '../../constants.js';
import type { Project } from '../../types/index.js';
import { DynamoDBClient } from '../client.js';
import type { QueryOptions, QueryResult } from '../types.js';

/**
 * Repository for Project entities
 */
export class ProjectRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Get a project by ID
   */
  async getById(projectId: string): Promise<Project | null> {
    return this.db.get<Project>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      'METADATA'
    );
  }

  /**
   * Get all active projects
   */
  async getActive(options?: QueryOptions): Promise<QueryResult<Project>> {
    const result = await this.db.queryGSI1<Project>(GSI1_PREFIX.STATUS_ACTIVE, {
      limit: options?.limit,
    });

    return {
      items: result.items,
      hasMore: !!result.lastKey,
      nextCursor: result.lastKey
        ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Create a new project
   */
  async create(project: Project): Promise<void> {
    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${project.id}`,
      SK: 'METADATA',
      GSI1PK: `${KEY_PREFIX.STATUS}${project.status}`,
      GSI1SK: project.updatedAt,
      ...project,
    });
  }

  /**
   * Update a project
   */
  async update(
    projectId: string,
    updates: Partial<Project>
  ): Promise<void> {
    const updateParts: string[] = [];
    const values: Record<string, unknown> = {};
    const names: Record<string, string> = {};

    Object.entries(updates).forEach(([key, value], index) => {
      updateParts.push(`#f${index} = :v${index}`);
      values[`:v${index}`] = value;
      names[`#f${index}`] = key;
    });

    // Always update updatedAt
    updateParts.push('#updatedAt = :updatedAt');
    values[':updatedAt'] = new Date().toISOString();
    names['#updatedAt'] = 'updatedAt';

    await this.db.update(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      'METADATA',
      `SET ${updateParts.join(', ')}`,
      values,
      names
    );
  }
}
