import { describe, it, expect } from 'vitest';

import {
  artefactToMarkdown,
  artefactToJson,
  allArtefactsToMarkdown,
} from '../export';

describe('artefactToMarkdown', () => {
  describe('delivery_state', () => {
    it('formats a full delivery state', () => {
      const content = {
        overallStatus: 'On Track',
        statusSummary: 'Sprint 5 is progressing well.',
        milestones: [
          { name: 'MVP Launch', status: 'in-progress', dueDate: '2026-03-01' },
          { name: 'Beta Release', status: 'planned', dueDate: '2026-04-15' },
        ],
        blockers: [
          { description: 'API rate limit exceeded', owner: 'Alice' },
        ],
        keyMetrics: {
          velocityTrend: 'increasing',
          avgCycleTimeDays: 3.5,
          openBlockers: 1,
          activeRisks: 2,
        },
        nextActions: ['Complete integration testing', 'Update stakeholders'],
      };

      const markdown = artefactToMarkdown('delivery_state', content);

      expect(markdown).toContain('# Delivery State');
      expect(markdown).toContain('**Overall Status:** On Track');
      expect(markdown).toContain('**Summary:** Sprint 5 is progressing well.');
      expect(markdown).toContain('## Milestones');
      expect(markdown).toContain('**MVP Launch**');
      expect(markdown).toContain('in-progress');
      expect(markdown).toContain('2026-03-01');
      expect(markdown).toContain('## Blockers');
      expect(markdown).toContain('API rate limit exceeded');
      expect(markdown).toContain('Owner: Alice');
      expect(markdown).toContain('## Key Metrics');
      expect(markdown).toContain('Velocity Trend: increasing');
      expect(markdown).toContain('Avg Cycle Time: 3.5 days');
      expect(markdown).toContain('Open Blockers: 1');
      expect(markdown).toContain('Active Risks: 2');
      expect(markdown).toContain('## Next Actions');
      expect(markdown).toContain('Complete integration testing');
      expect(markdown).toContain('Update stakeholders');
    });

    it('handles minimal delivery state', () => {
      const content = {};
      const markdown = artefactToMarkdown('delivery_state', content);

      expect(markdown).toContain('# Delivery State');
      expect(markdown).toContain('**Overall Status:** Unknown');
      expect(markdown).toContain('**Summary:** No summary available.');
      expect(markdown).not.toContain('## Milestones');
      expect(markdown).not.toContain('## Blockers');
      expect(markdown).not.toContain('## Key Metrics');
      expect(markdown).not.toContain('## Next Actions');
    });

    it('handles string content (JSON)', () => {
      const content = JSON.stringify({
        overallStatus: 'At Risk',
        statusSummary: 'Delays in API integration.',
      });

      const markdown = artefactToMarkdown('delivery_state', content);

      expect(markdown).toContain('**Overall Status:** At Risk');
      expect(markdown).toContain('**Summary:** Delays in API integration.');
    });
  });

  describe('raid_log', () => {
    it('formats a RAID log with grouped items', () => {
      const content = {
        items: [
          { type: 'risk', status: 'open', description: 'Budget overrun', owner: 'PM', identifiedDate: '2026-01-15' },
          { type: 'risk', status: 'mitigated', description: 'Vendor delay', owner: 'Lead', raisedDate: '2026-01-20' },
          { type: 'action', status: 'in-progress', title: 'Update plan', owner: 'PM', identifiedDate: '2026-01-25' },
          { type: 'issue', status: 'open', description: 'Server outage', owner: 'DevOps', identifiedDate: '2026-02-01' },
        ],
      };

      const markdown = artefactToMarkdown('raid_log', content);

      expect(markdown).toContain('# RAID Log');
      expect(markdown).toContain('## Risks');
      expect(markdown).toContain('## Actions');
      expect(markdown).toContain('## Issues');
      expect(markdown).toContain('| Status | Description | Owner | Date |');
      expect(markdown).toContain('Budget overrun');
      expect(markdown).toContain('Vendor delay');
      expect(markdown).toContain('Update plan');
      expect(markdown).toContain('Server outage');
    });

    it('handles empty RAID log', () => {
      const content = { items: [] };
      const markdown = artefactToMarkdown('raid_log', content);

      expect(markdown).toContain('# RAID Log');
      expect(markdown).toContain('No items recorded.');
    });

    it('handles missing items array', () => {
      const content = {};
      const markdown = artefactToMarkdown('raid_log', content);

      expect(markdown).toContain('# RAID Log');
      expect(markdown).toContain('No items recorded.');
    });
  });

  describe('backlog_summary', () => {
    it('formats a full backlog summary', () => {
      const content = {
        source: 'Jira',
        lastSynced: '2026-02-07T10:00:00Z',
        summary: {
          totalItems: 42,
          byStatus: { toDo: 15, inProgress: 10, doneThisSprint: 12, blocked: 5 },
          byPriority: { critical: 2, high: 8, medium: 20, low: 12 },
        },
        highlights: ['Sprint goal 80% complete', 'New epic added for Q2'],
      };

      const markdown = artefactToMarkdown('backlog_summary', content);

      expect(markdown).toContain('# Backlog Summary');
      expect(markdown).toContain('**Source:** Jira');
      expect(markdown).toContain('**Total Items:** 42');
      expect(markdown).toContain('## By Status');
      expect(markdown).toContain('To Do: 15');
      expect(markdown).toContain('In Progress: 10');
      expect(markdown).toContain('Done This Sprint: 12');
      expect(markdown).toContain('Blocked: 5');
      expect(markdown).toContain('## By Priority');
      expect(markdown).toContain('Critical: 2');
      expect(markdown).toContain('High: 8');
      expect(markdown).toContain('Medium: 20');
      expect(markdown).toContain('Low: 12');
      expect(markdown).toContain('## Highlights');
      expect(markdown).toContain('Sprint goal 80% complete');
      expect(markdown).toContain('New epic added for Q2');
    });

    it('handles empty backlog summary', () => {
      const content = {};
      const markdown = artefactToMarkdown('backlog_summary', content);

      expect(markdown).toContain('# Backlog Summary');
      expect(markdown).not.toContain('## By Status');
      expect(markdown).not.toContain('## Highlights');
    });
  });

  describe('decision_log', () => {
    it('formats a decision log with multiple decisions', () => {
      const content = {
        decisions: [
          {
            title: 'Use DynamoDB',
            date: '2026-01-10',
            status: 'approved',
            context: 'Need a serverless database',
            decision: 'Use DynamoDB single-table design',
            rationale: 'Cost-effective at our scale',
            owner: 'Tech Lead',
          },
          {
            title: 'Defer Teams integration',
            decidedDate: '2026-01-15',
            status: 'approved',
            decision: 'Not pursuing Teams integration',
          },
        ],
      };

      const markdown = artefactToMarkdown('decision_log', content);

      expect(markdown).toContain('# Decision Log');
      expect(markdown).toContain('## Use DynamoDB');
      expect(markdown).toContain('**Date:** 2026-01-10');
      expect(markdown).toContain('**Status:** approved');
      expect(markdown).toContain('**Context:** Need a serverless database');
      expect(markdown).toContain('**Decision:** Use DynamoDB single-table design');
      expect(markdown).toContain('**Rationale:** Cost-effective at our scale');
      expect(markdown).toContain('**Owner:** Tech Lead');
      expect(markdown).toContain('## Defer Teams integration');
      expect(markdown).toContain('**Date:** 2026-01-15');
    });

    it('handles empty decision log', () => {
      const content = { decisions: [] };
      const markdown = artefactToMarkdown('decision_log', content);

      expect(markdown).toContain('# Decision Log');
      expect(markdown).toContain('No decisions recorded.');
    });

    it('handles missing decisions array', () => {
      const content = {};
      const markdown = artefactToMarkdown('decision_log', content);

      expect(markdown).toContain('# Decision Log');
      expect(markdown).toContain('No decisions recorded.');
    });
  });

  describe('unknown type', () => {
    it('falls back to JSON for unknown types', () => {
      const content = { foo: 'bar' };
      // Cast to test fallback behaviour
      const markdown = artefactToMarkdown('unknown_type' as never, content);

      expect(markdown).toContain('"foo"');
      expect(markdown).toContain('"bar"');
    });
  });
});

describe('artefactToJson', () => {
  it('formats object content as pretty JSON', () => {
    const content = { key: 'value', nested: { a: 1 } };
    const json = artefactToJson(content);

    expect(json).toBe(JSON.stringify(content, null, 2));
  });

  it('parses string content before formatting', () => {
    const obj = { key: 'value' };
    const content = JSON.stringify(obj);
    const json = artefactToJson(content);

    expect(json).toBe(JSON.stringify(obj, null, 2));
  });
});

describe('allArtefactsToMarkdown', () => {
  it('combines multiple artefacts with separators', () => {
    const artefacts = [
      {
        type: 'delivery_state' as const,
        content: { overallStatus: 'On Track', statusSummary: 'Going well' },
      },
      {
        type: 'raid_log' as const,
        content: { items: [] },
      },
    ];

    const markdown = allArtefactsToMarkdown(artefacts);

    expect(markdown).toContain('# Delivery State');
    expect(markdown).toContain('---');
    expect(markdown).toContain('# RAID Log');
  });

  it('handles single artefact', () => {
    const artefacts = [
      {
        type: 'decision_log' as const,
        content: { decisions: [] },
      },
    ];

    const markdown = allArtefactsToMarkdown(artefacts);

    expect(markdown).toContain('# Decision Log');
    expect(markdown).not.toContain('---');
  });

  it('handles empty array', () => {
    const markdown = allArtefactsToMarkdown([]);
    expect(markdown).toBe('');
  });
});
