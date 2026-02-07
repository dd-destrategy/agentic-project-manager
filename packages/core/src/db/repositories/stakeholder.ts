/**
 * Stakeholder repository
 *
 * Tracks implicit social graph — people who appear in signals
 * from Jira and Outlook. Enables engagement anomaly detection.
 */

import { KEY_PREFIX } from '../../constants.js';
import { DynamoDBClient } from '../client.js';

export interface Stakeholder {
  id: string;
  projectId: string;
  name: string;
  email?: string;
  role?: string;
  interactionCount: number;
  lastSeenAt: string;
  firstSeenAt: string;
  sources: string[];
  communicationFrequency: number; // avg days between interactions
  lastInteractionTypes: string[];
  isActive: boolean;
}

export interface StakeholderActivity {
  name: string;
  action: string;
  source: string;
  timestamp: string;
}

export class StakeholderRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Upsert a stakeholder — create if new, update counts if existing.
   */
  async upsert(
    projectId: string,
    stakeholder: Partial<Stakeholder> & { name: string }
  ): Promise<void> {
    const existing = await this.get(projectId, stakeholder.name);
    const now = new Date().toISOString();

    if (existing) {
      // Update interaction count and last seen
      await this.db.update(
        `${KEY_PREFIX.PROJECT}${projectId}`,
        `STAKEHOLDER#${stakeholder.name}`,
        'SET interactionCount = interactionCount + :one, lastSeenAt = :now, #sources = :sources, lastInteractionTypes = :types',
        {
          ':one': 1,
          ':now': now,
          ':sources': [
            ...new Set([
              ...(existing.sources || []),
              ...(stakeholder.sources || []),
            ]),
          ],
          ':types': (stakeholder.lastInteractionTypes || []).slice(0, 5),
        },
        { '#sources': 'sources' }
      );
    } else {
      await this.db.put({
        PK: `${KEY_PREFIX.PROJECT}${projectId}`,
        SK: `STAKEHOLDER#${stakeholder.name}`,
        id: crypto.randomUUID(),
        projectId,
        name: stakeholder.name,
        email: stakeholder.email,
        role: stakeholder.role,
        interactionCount: 1,
        lastSeenAt: now,
        firstSeenAt: now,
        sources: stakeholder.sources || [],
        communicationFrequency: 0,
        lastInteractionTypes: stakeholder.lastInteractionTypes || [],
        isActive: true,
      });
    }
  }

  /**
   * Get a single stakeholder by project and name.
   */
  async get(projectId: string, name: string): Promise<Stakeholder | null> {
    return this.db.get<Stakeholder>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `STAKEHOLDER#${name}`
    );
  }

  /**
   * Get all stakeholders for a project.
   */
  async getAllForProject(projectId: string): Promise<Stakeholder[]> {
    const result = await this.db.query<Stakeholder>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      'STAKEHOLDER#',
      { limit: 100 }
    );
    return result.items;
  }

  /**
   * Detect stakeholders with abnormal engagement silence.
   *
   * Returns active stakeholders who have been silent for at least
   * 2x their normal communication frequency.
   */
  async getEngagementAnomalies(projectId: string): Promise<Stakeholder[]> {
    const all = await this.getAllForProject(projectId);
    const now = Date.now();

    return all.filter((s) => {
      if (!s.isActive || s.interactionCount < 3) return false;
      const daysSinceLastSeen =
        (now - new Date(s.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24);
      // If they've been silent for 2x their normal frequency, flag it
      return (
        s.communicationFrequency > 0 &&
        daysSinceLastSeen > s.communicationFrequency * 2
      );
    });
  }
}
