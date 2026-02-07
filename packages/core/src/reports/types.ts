/**
 * Status Report types
 *
 * Types for the report generation and management system.
 */

export type ReportTemplate = 'executive' | 'team' | 'steering_committee';
export type ReportStatus = 'draft' | 'sent' | 'archived';

export interface StatusReport {
  id: string;
  projectId: string;
  template: ReportTemplate;
  title: string;
  content: ReportContent;
  generatedAt: string;
  sentAt?: string;
  sentTo?: string[];
  status: ReportStatus;
}

export interface ReportContent {
  summary: string;
  healthStatus: string;
  keyHighlights: string[];
  risksAndBlockers: string[];
  decisionsNeeded: string[];
  upcomingMilestones: string[];
  metricsSnapshot: Record<string, string | number>;
}
