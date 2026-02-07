/**
 * Artefact Snapshot Repository
 *
 * Stores periodic snapshots of artefact content for trend analysis.
 * PK: PROJECT#{projectId}  SK: SNAPSHOT#{artefactType}#{timestamp}
 */

import { KEY_PREFIX } from '../../constants.js';
import type { ArtefactType } from '../../types/index.js';
import { DynamoDBClient } from '../client.js';

export interface ArtefactSnapshot {
  projectId: string;
  artefactType: ArtefactType;
  timestamp: string;
  metrics: SnapshotMetrics;
  contentHash: string;
  createdAt: string;
}

export interface SnapshotMetrics {
  // Delivery state
  overallStatus?: 'green' | 'amber' | 'red';
  blockerCount?: number;
  milestoneCount?: number;
  completedPoints?: number;
  totalPoints?: number;
  // RAID log
  openRisks?: number;
  openIssues?: number;
  totalItems?: number;
  // Backlog
  totalBacklogItems?: number;
  blockedItems?: number;
  // Decision log
  totalDecisions?: number;
  activeDecisions?: number;
}

export interface TrendDataPoint {
  timestamp: string;
  metrics: SnapshotMetrics;
}

const SNAPSHOT_PREFIX = 'SNAPSHOT#';

export class ArtefactSnapshotRepository {
  constructor(private db: DynamoDBClient) {}

  async create(snapshot: ArtefactSnapshot): Promise<void> {
    const now = new Date().toISOString();
    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${snapshot.projectId}`,
      SK: `${SNAPSHOT_PREFIX}${snapshot.artefactType}#${snapshot.timestamp}`,
      ...snapshot,
      createdAt: now,
      ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days TTL
    });
  }

  async getTrend(
    projectId: string,
    artefactType: ArtefactType,
    options?: { limit?: number; since?: string }
  ): Promise<TrendDataPoint[]> {
    const skPrefix = `${SNAPSHOT_PREFIX}${artefactType}#`;
    const skStart = options?.since ? `${skPrefix}${options.since}` : skPrefix;

    const result = await this.db.query<
      ArtefactSnapshot & Record<string, unknown>
    >(`${KEY_PREFIX.PROJECT}${projectId}`, skStart, {
      limit: options?.limit ?? 30,
      ascending: true,
    });

    return result.items.map((item) => ({
      timestamp: item.timestamp,
      metrics: item.metrics,
    }));
  }

  async getLatest(
    projectId: string,
    artefactType: ArtefactType
  ): Promise<ArtefactSnapshot | null> {
    const result = await this.db.query<
      ArtefactSnapshot & Record<string, unknown>
    >(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `${SNAPSHOT_PREFIX}${artefactType}#`,
      { limit: 1, ascending: false }
    );

    return result.items[0] ?? null;
  }
}
