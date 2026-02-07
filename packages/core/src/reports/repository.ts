/**
 * Status Report Repository
 *
 * CRUD operations for status reports in DynamoDB.
 * PK = PROJECT#{projectId}, SK = REPORT#{timestamp}
 */

import { KEY_PREFIX } from '../constants.js';
import { DynamoDBClient } from '../db/client.js';
import type { StatusReport, ReportStatus } from './types.js';

/**
 * Repository for StatusReport entities
 */
export class StatusReportRepository {
  constructor(private db: DynamoDBClient) {}

  /**
   * Create a new status report
   */
  async create(report: StatusReport): Promise<void> {
    await this.db.put({
      PK: `${KEY_PREFIX.PROJECT}${report.projectId}`,
      SK: `REPORT#${report.generatedAt}`,
      ...report,
    });
  }

  /**
   * Get reports for a project, ordered by most recent first
   */
  async getByProject(
    projectId: string,
    limit: number = 20
  ): Promise<StatusReport[]> {
    const result = await this.db.query<StatusReport>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      'REPORT#',
      { limit, ascending: false }
    );
    return result.items;
  }

  /**
   * Get a specific report by project and report ID (generatedAt timestamp)
   */
  async getById(
    projectId: string,
    reportId: string
  ): Promise<StatusReport | null> {
    return this.db.get<StatusReport>(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `REPORT#${reportId}`
    );
  }

  /**
   * Update the status of a report (e.g. draft -> sent)
   */
  async updateStatus(
    projectId: string,
    reportId: string,
    status: ReportStatus,
    extra?: { sentAt?: string; sentTo?: string[] }
  ): Promise<void> {
    let updateExpression = 'SET #status = :status';
    const expressionAttributeValues: Record<string, unknown> = {
      ':status': status,
    };
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
    };

    if (extra?.sentAt) {
      updateExpression += ', sentAt = :sentAt';
      expressionAttributeValues[':sentAt'] = extra.sentAt;
    }

    if (extra?.sentTo) {
      updateExpression += ', sentTo = :sentTo';
      expressionAttributeValues[':sentTo'] = extra.sentTo;
    }

    await this.db.update(
      `${KEY_PREFIX.PROJECT}${projectId}`,
      `REPORT#${reportId}`,
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );
  }
}
