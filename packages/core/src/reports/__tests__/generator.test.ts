/**
 * StatusReportGenerator Tests
 *
 * Tests report generation for each template type, with empty and full artefacts.
 */

import { describe, it, expect } from 'vitest';
import { StatusReportGenerator } from '../generator.js';
import type { GeneratorInput, RecentEventSummary } from '../generator.js';
import type { Artefact } from '../../types/index.js';

function makeArtefact(
  type: string,
  content: unknown
): Artefact {
  return {
    id: crypto.randomUUID(),
    projectId: 'proj-1',
    type: type as Artefact['type'],
    content: content as Artefact['content'],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  };
}

const fullDeliveryState = makeArtefact('delivery_state', {
  overallStatus: 'amber',
  statusSummary: 'Sprint 5 nearing end with two blockers outstanding.',
  currentSprint: {
    name: 'Sprint 5',
    startDate: '2026-01-06T00:00:00.000Z',
    endDate: '2026-01-20T00:00:00.000Z',
    goal: 'Complete user auth flow',
    progress: {
      totalPoints: 40,
      completedPoints: 28,
      inProgressPoints: 8,
      blockedPoints: 4,
    },
  },
  milestones: [
    {
      name: 'MVP Launch',
      dueDate: '2026-02-15T00:00:00.000Z',
      status: 'at_risk',
      notes: 'Blocked by auth dependency',
    },
    {
      name: 'Beta Release',
      dueDate: '2026-03-01T00:00:00.000Z',
      status: 'on_track',
    },
  ],
  blockers: [
    {
      id: 'BLK-1',
      description: 'Third-party API rate limit reached',
      owner: 'Alice',
      raisedDate: '2026-01-10T00:00:00.000Z',
      severity: 'high',
    },
  ],
  keyMetrics: {
    velocityTrend: 'stable',
    avgCycleTimeDays: 3.5,
    openBlockers: 1,
    activeRisks: 2,
  },
  nextActions: ['Resolve API rate limit', 'Update stakeholders'],
});

const fullRaidLog = makeArtefact('raid_log', {
  items: [
    {
      id: 'R-1',
      type: 'risk',
      title: 'Vendor contract renewal',
      description: 'Contract expires in 30 days',
      severity: 'high',
      status: 'open',
      owner: 'Bob',
      raisedDate: '2026-01-05T00:00:00.000Z',
      source: 'agent_detected',
      lastReviewed: '2026-01-14T00:00:00.000Z',
    },
    {
      id: 'I-1',
      type: 'issue',
      title: 'CI pipeline failures',
      description: 'Flaky tests causing delays',
      severity: 'medium',
      status: 'mitigating',
      owner: 'Charlie',
      raisedDate: '2026-01-08T00:00:00.000Z',
      source: 'user_added',
      lastReviewed: '2026-01-14T00:00:00.000Z',
    },
  ],
});

const fullBacklogSummary = makeArtefact('backlog_summary', {
  source: 'jira',
  lastSynced: '2026-01-15T00:00:00.000Z',
  summary: {
    totalItems: 45,
    byStatus: { toDo: 15, inProgress: 10, doneThisSprint: 12, blocked: 3 },
    byPriority: { critical: 2, high: 10, medium: 20, low: 13 },
  },
  highlights: [],
  refinementCandidates: [],
});

const fullDecisionLog = makeArtefact('decision_log', {
  decisions: [
    {
      id: 'D-1',
      title: 'Use PostgreSQL over DynamoDB',
      context: 'Database selection',
      optionsConsidered: [
        { option: 'PostgreSQL', pros: ['SQL'], cons: ['Cost'] },
        { option: 'DynamoDB', pros: ['Serverless'], cons: ['NoSQL'] },
      ],
      decision: 'PostgreSQL',
      rationale: 'Team expertise',
      madeBy: 'user',
      date: '2026-01-10T00:00:00.000Z',
      status: 'active',
    },
  ],
});

const recentEvents: RecentEventSummary = {
  totalEvents: 42,
  signalsDetected: 15,
  actionsTaken: 8,
  escalationsCreated: 2,
};

describe('StatusReportGenerator', () => {
  const generator = new StatusReportGenerator();

  describe('executive template', () => {
    it('should generate an executive report with full artefacts', () => {
      const input: GeneratorInput = {
        delivery_state: fullDeliveryState,
        raid_log: fullRaidLog,
        backlog_summary: fullBacklogSummary,
        decision_log: fullDecisionLog,
      };

      const report = generator.generateReport(
        'proj-1',
        'executive',
        input,
        recentEvents
      );

      expect(report.template).toBe('executive');
      expect(report.status).toBe('draft');
      expect(report.projectId).toBe('proj-1');
      expect(report.title).toContain('Executive');
      expect(report.content.healthStatus).toBe('amber');
      expect(report.content.summary).toContain('Executive Summary');
      // Executive limits to 3 items each
      expect(report.content.keyHighlights.length).toBeLessThanOrEqual(3);
      expect(report.content.risksAndBlockers.length).toBeLessThanOrEqual(3);
      expect(report.content.metricsSnapshot['overallStatus']).toBe('amber');
      expect(report.content.metricsSnapshot['openBlockers']).toBe(1);
      expect(report.content.metricsSnapshot['recentSignals']).toBe(15);
    });

    it('should generate an executive report with empty artefacts', () => {
      const input: GeneratorInput = {};

      const report = generator.generateReport('proj-1', 'executive', input);

      expect(report.template).toBe('executive');
      expect(report.content.healthStatus).toBe('unknown');
      expect(report.content.summary).toContain('No delivery state available');
      expect(report.content.keyHighlights).toHaveLength(0);
      expect(report.content.risksAndBlockers).toHaveLength(0);
      expect(report.content.decisionsNeeded).toHaveLength(0);
      expect(report.content.upcomingMilestones).toHaveLength(0);
      expect(Object.keys(report.content.metricsSnapshot)).toHaveLength(0);
    });
  });

  describe('team template', () => {
    it('should generate a team report with full artefacts', () => {
      const input: GeneratorInput = {
        delivery_state: fullDeliveryState,
        raid_log: fullRaidLog,
        backlog_summary: fullBacklogSummary,
        decision_log: fullDecisionLog,
      };

      const report = generator.generateReport(
        'proj-1',
        'team',
        input,
        recentEvents
      );

      expect(report.template).toBe('team');
      expect(report.title).toContain('Team');
      expect(report.content.summary).toContain('Team Update');
      // Team includes all risks and next actions
      expect(report.content.keyHighlights.length).toBeGreaterThan(3);
      // Should include next actions
      const hasAction = report.content.keyHighlights.some((h) =>
        h.startsWith('Action:')
      );
      expect(hasAction).toBe(true);
    });

    it('should generate a team report with empty artefacts', () => {
      const report = generator.generateReport('proj-1', 'team', {});

      expect(report.content.summary).toContain('Team Update');
      expect(report.content.keyHighlights).toHaveLength(0);
    });
  });

  describe('steering_committee template', () => {
    it('should generate a steering committee report with full artefacts', () => {
      const input: GeneratorInput = {
        delivery_state: fullDeliveryState,
        raid_log: fullRaidLog,
        backlog_summary: fullBacklogSummary,
        decision_log: fullDecisionLog,
      };

      const report = generator.generateReport(
        'proj-1',
        'steering_committee',
        input,
        recentEvents
      );

      expect(report.template).toBe('steering_committee');
      expect(report.title).toContain('Steering Committee');
      expect(report.content.summary).toContain('Steering Committee Report');
      // Steering committee includes all decisions with status
      expect(report.content.decisionsNeeded.length).toBeGreaterThan(0);
      expect(report.content.decisionsNeeded[0]).toContain('[active]');
      // Steering committee shows all risks
      expect(report.content.risksAndBlockers.length).toBeGreaterThan(0);
    });

    it('should generate a steering report with empty artefacts', () => {
      const report = generator.generateReport(
        'proj-1',
        'steering_committee',
        {}
      );

      expect(report.content.summary).toContain('Steering Committee Report');
      expect(report.content.healthStatus).toBe('unknown');
    });
  });

  describe('report metadata', () => {
    it('should set a unique id for each report', () => {
      const r1 = generator.generateReport('proj-1', 'executive', {});
      const r2 = generator.generateReport('proj-1', 'executive', {});

      expect(r1.id).toBeDefined();
      expect(r2.id).toBeDefined();
      expect(r1.id).not.toBe(r2.id);
    });

    it('should set generatedAt to a valid ISO timestamp', () => {
      const report = generator.generateReport('proj-1', 'executive', {});

      expect(report.generatedAt).toBeDefined();
      expect(new Date(report.generatedAt).toISOString()).toBe(
        report.generatedAt
      );
    });

    it('should extract milestone data correctly', () => {
      const input: GeneratorInput = {
        delivery_state: fullDeliveryState,
      };

      const report = generator.generateReport('proj-1', 'executive', input);

      // MVP Launch is at_risk, Beta is on_track — neither completed, both shown
      expect(report.content.upcomingMilestones.length).toBe(2);
      expect(report.content.upcomingMilestones[0]).toContain('MVP Launch');
      expect(report.content.upcomingMilestones[0]).toContain('at risk');
    });
  });
});
