/**
 * Artefact Coherence Auditor Tests
 *
 * Tests cross-artefact consistency checks covering all 5 audit checks.
 */

import { describe, it, expect } from 'vitest';
import { auditCoherence } from '../coherence.js';

describe('auditCoherence', () => {
  it('returns empty array when all artefacts are empty', () => {
    const issues = auditCoherence({});
    expect(issues).toEqual([]);
  });

  it('returns empty array when all artefacts are coherent', () => {
    const issues = auditCoherence({
      deliveryState: {
        overallStatus: 'amber',
        blockers: [{ id: 'B-001', description: 'API delay', severity: 'high' }],
        keyMetrics: {
          openBlockers: 1,
          activeRisks: 2,
        },
      },
      raidLog: {
        items: [
          { id: 'R-001', type: 'risk', status: 'open', severity: 'high' },
          {
            id: 'R-002',
            type: 'risk',
            status: 'mitigating',
            severity: 'medium',
          },
          { id: 'R-003', type: 'issue', status: 'open', severity: 'low' },
        ],
      },
      decisionLog: {
        decisions: [
          { id: 'D-001', status: 'active', relatedRaidItems: ['R-001'] },
        ],
      },
      backlogSummary: {
        summary: {
          totalItems: 20,
          byStatus: { blocked: 1 },
        },
      },
    });
    expect(issues).toEqual([]);
  });

  // Check 1: Blocker count consistency
  describe('Check 1: Blocker count consistency', () => {
    it('detects mismatch between reported and actual blocker count', () => {
      const issues = auditCoherence({
        deliveryState: {
          blockers: [
            { id: 'B-001', description: 'Blocker 1', severity: 'high' },
          ],
          keyMetrics: {
            openBlockers: 3, // Says 3 but only 1 actual
            activeRisks: 0,
          },
        },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].field).toBe('keyMetrics.openBlockers');
      expect(issues[0].message).toContain('3');
      expect(issues[0].message).toContain('1');
      expect(issues[0].suggestion).toContain('1');
    });

    it('detects zero reported but non-zero actual blockers', () => {
      const issues = auditCoherence({
        deliveryState: {
          blockers: [
            { id: 'B-001', description: 'Blocker', severity: 'high' },
            { id: 'B-002', description: 'Blocker 2', severity: 'medium' },
          ],
          keyMetrics: {
            openBlockers: 0,
            activeRisks: 0,
          },
        },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0].field).toBe('keyMetrics.openBlockers');
    });

    it('passes when blocker count matches', () => {
      const issues = auditCoherence({
        deliveryState: {
          blockers: [{ id: 'B-001', description: 'Blocker', severity: 'high' }],
          keyMetrics: {
            openBlockers: 1,
            activeRisks: 0,
          },
        },
      });

      // No blocker count issue (may have other issues like status check)
      const blockerIssues = issues.filter(
        (i) => i.field === 'keyMetrics.openBlockers'
      );
      expect(blockerIssues).toHaveLength(0);
    });
  });

  // Check 2: Active risks count consistency
  describe('Check 2: Active risks count consistency', () => {
    it('detects mismatch between reported and actual active risks', () => {
      const issues = auditCoherence({
        deliveryState: {
          keyMetrics: {
            openBlockers: 0,
            activeRisks: 5, // Says 5 but only 1 open risk
          },
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'high' },
            {
              id: 'R-002',
              type: 'risk',
              status: 'resolved',
              severity: 'medium',
            },
            { id: 'R-003', type: 'issue', status: 'open', severity: 'low' },
          ],
        },
      });

      const riskIssues = issues.filter(
        (i) => i.field === 'keyMetrics.activeRisks'
      );
      expect(riskIssues).toHaveLength(1);
      expect(riskIssues[0].message).toContain('5');
      expect(riskIssues[0].message).toContain('1');
    });

    it('counts mitigating risks as active', () => {
      const issues = auditCoherence({
        deliveryState: {
          keyMetrics: {
            openBlockers: 0,
            activeRisks: 2,
          },
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'high' },
            {
              id: 'R-002',
              type: 'risk',
              status: 'mitigating',
              severity: 'medium',
            },
          ],
        },
      });

      const riskIssues = issues.filter(
        (i) => i.field === 'keyMetrics.activeRisks'
      );
      expect(riskIssues).toHaveLength(0); // 2 reported, 2 actual (open + mitigating)
    });
  });

  // Check 3: Decision references to RAID items
  describe('Check 3: Decision references to RAID items', () => {
    it('detects decisions referencing non-existent RAID items', () => {
      const issues = auditCoherence({
        decisionLog: {
          decisions: [
            {
              id: 'D-001',
              status: 'active',
              relatedRaidItems: ['R-001', 'R-999'],
            },
          ],
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'high' },
          ],
        },
      });

      const refIssues = issues.filter((i) =>
        i.field.includes('relatedRaidItems')
      );
      expect(refIssues).toHaveLength(1);
      expect(refIssues[0].severity).toBe('info');
      expect(refIssues[0].message).toContain('R-999');
      expect(refIssues[0].message).toContain('does not exist');
    });

    it('passes when all RAID references are valid', () => {
      const issues = auditCoherence({
        decisionLog: {
          decisions: [
            {
              id: 'D-001',
              status: 'active',
              relatedRaidItems: ['R-001'],
            },
          ],
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'high' },
          ],
        },
      });

      const refIssues = issues.filter((i) =>
        i.field.includes('relatedRaidItems')
      );
      expect(refIssues).toHaveLength(0);
    });

    it('handles decisions without relatedRaidItems', () => {
      const issues = auditCoherence({
        decisionLog: {
          decisions: [{ id: 'D-001', status: 'active' }],
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'high' },
          ],
        },
      });

      const refIssues = issues.filter((i) =>
        i.field.includes('relatedRaidItems')
      );
      expect(refIssues).toHaveLength(0);
    });
  });

  // Check 4: Blocked items in backlog vs delivery state blockers
  describe('Check 4: Blocked backlog items vs delivery blockers', () => {
    it('detects blocked backlog items with no delivery blockers', () => {
      const issues = auditCoherence({
        backlogSummary: {
          summary: {
            totalItems: 20,
            byStatus: { blocked: 3 },
          },
        },
        deliveryState: {
          blockers: [],
        },
      });

      const blockerIssues = issues.filter((i) => i.field === 'blockers');
      expect(blockerIssues).toHaveLength(1);
      expect(blockerIssues[0].severity).toBe('warning');
      expect(blockerIssues[0].message).toContain('3 blocked items');
      expect(blockerIssues[0].message).toContain('no blockers');
    });

    it('passes when backlog has no blocked items', () => {
      const issues = auditCoherence({
        backlogSummary: {
          summary: {
            totalItems: 20,
            byStatus: { blocked: 0 },
          },
        },
        deliveryState: {
          blockers: [],
        },
      });

      const blockerIssues = issues.filter((i) => i.field === 'blockers');
      expect(blockerIssues).toHaveLength(0);
    });

    it('passes when blocked items exist alongside delivery blockers', () => {
      const issues = auditCoherence({
        backlogSummary: {
          summary: {
            totalItems: 20,
            byStatus: { blocked: 2 },
          },
        },
        deliveryState: {
          blockers: [{ id: 'B-001', description: 'Blocker', severity: 'high' }],
        },
      });

      const blockerIssues = issues.filter((i) => i.field === 'blockers');
      expect(blockerIssues).toHaveLength(0);
    });
  });

  // Check 5: Overall status consistency
  describe('Check 5: Overall status consistency', () => {
    it('detects green status with open blockers', () => {
      const issues = auditCoherence({
        deliveryState: {
          overallStatus: 'green',
          blockers: [{ id: 'B-001', description: 'Problem', severity: 'high' }],
          keyMetrics: {
            openBlockers: 1,
            activeRisks: 0,
          },
        },
      });

      const statusIssues = issues.filter((i) => i.field === 'overallStatus');
      expect(statusIssues).toHaveLength(1);
      expect(statusIssues[0].message).toContain('green');
      expect(statusIssues[0].message).toContain('open blockers');
      expect(statusIssues[0].suggestion).toContain('amber');
    });

    it('detects green status with critical RAID items', () => {
      const issues = auditCoherence({
        deliveryState: {
          overallStatus: 'green',
          keyMetrics: {
            openBlockers: 0,
            activeRisks: 1,
          },
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'critical' },
          ],
        },
      });

      const statusIssues = issues.filter((i) => i.field === 'overallStatus');
      expect(statusIssues).toHaveLength(1);
      expect(statusIssues[0].message).toContain('critical RAID items');
    });

    it('detects green status with both blockers and critical RAID items', () => {
      const issues = auditCoherence({
        deliveryState: {
          overallStatus: 'green',
          blockers: [{ id: 'B-001', description: 'Problem', severity: 'high' }],
          keyMetrics: {
            openBlockers: 1,
            activeRisks: 1,
          },
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'critical' },
          ],
        },
      });

      const statusIssues = issues.filter((i) => i.field === 'overallStatus');
      expect(statusIssues).toHaveLength(1);
      expect(statusIssues[0].message).toContain('open blockers');
      expect(statusIssues[0].message).toContain('critical RAID items');
    });

    it('passes when status is amber or red with issues', () => {
      const issues = auditCoherence({
        deliveryState: {
          overallStatus: 'amber',
          blockers: [{ id: 'B-001', description: 'Problem', severity: 'high' }],
          keyMetrics: {
            openBlockers: 1,
            activeRisks: 0,
          },
        },
      });

      const statusIssues = issues.filter((i) => i.field === 'overallStatus');
      expect(statusIssues).toHaveLength(0);
    });

    it('passes when green status with no blockers or critical items', () => {
      const issues = auditCoherence({
        deliveryState: {
          overallStatus: 'green',
          blockers: [],
          keyMetrics: {
            openBlockers: 0,
            activeRisks: 0,
          },
        },
        raidLog: {
          items: [
            { id: 'R-001', type: 'risk', status: 'open', severity: 'medium' },
          ],
        },
      });

      const statusIssues = issues.filter((i) => i.field === 'overallStatus');
      expect(statusIssues).toHaveLength(0);
    });
  });

  // Sorting
  describe('issue sorting', () => {
    it('sorts issues by severity: error > warning > info', () => {
      const issues = auditCoherence({
        deliveryState: {
          overallStatus: 'green',
          blockers: [{ id: 'B-001', description: 'Problem', severity: 'high' }],
          keyMetrics: {
            openBlockers: 5, // mismatch => warning
            activeRisks: 0,
          },
        },
        decisionLog: {
          decisions: [
            {
              id: 'D-001',
              status: 'active',
              relatedRaidItems: ['R-MISSING'], // missing ref => info
            },
          ],
        },
        raidLog: {
          items: [],
        },
      });

      // Should have at least warning and info level issues
      const warningIssues = issues.filter((i) => i.severity === 'warning');
      const infoIssues = issues.filter((i) => i.severity === 'info');

      expect(warningIssues.length).toBeGreaterThan(0);
      expect(infoIssues.length).toBeGreaterThan(0);

      // All warnings should come before info
      const firstInfoIndex = issues.findIndex((i) => i.severity === 'info');
      const lastWarningIndex =
        issues.length -
        1 -
        [...issues].reverse().findIndex((i) => i.severity === 'warning');
      expect(lastWarningIndex).toBeLessThan(firstInfoIndex);
    });
  });
});
