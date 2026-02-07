/**
 * Stale Item Watchdog Tests
 *
 * Tests stale detection with various artefact states and thresholds.
 */

import { describe, it, expect } from 'vitest';
import { detectStaleItems } from '../stale-watchdog.js';
import type { ArtefactType } from '../../types/index.js';

const NOW = new Date('2026-02-07T12:00:00.000Z');

function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe('detectStaleItems', () => {
  it('returns empty array when no artefacts are provided', () => {
    const warnings = detectStaleItems([], NOW);
    expect(warnings).toEqual([]);
  });

  it('returns empty array when all items are fresh', () => {
    const artefacts = [
      {
        type: 'raid_log' as ArtefactType,
        content: {
          items: [
            {
              id: 'R-001',
              type: 'risk',
              title: 'Fresh risk',
              description: 'A fresh risk',
              severity: 'medium',
              status: 'open',
              owner: 'PM',
              raisedDate: daysAgo(5),
              source: 'user_added',
              lastReviewed: daysAgo(3),
            },
          ],
        },
      },
    ];

    const warnings = detectStaleItems(artefacts, NOW);
    expect(warnings).toEqual([]);
  });

  // RAID log tests
  describe('RAID log stale detection', () => {
    it('detects warning-level stale RAID items (14+ days)', () => {
      const artefacts = [
        {
          type: 'raid_log' as ArtefactType,
          content: {
            items: [
              {
                id: 'R-001',
                type: 'risk',
                title: 'Stale risk',
                description: 'A stale risk',
                severity: 'high',
                status: 'open',
                owner: 'PM',
                raisedDate: daysAgo(20),
                source: 'user_added',
                lastReviewed: daysAgo(15),
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].artefactType).toBe('raid_log');
      expect(warnings[0].itemId).toBe('R-001');
      expect(warnings[0].daysSinceReview).toBe(15);
    });

    it('detects critical-level stale RAID items (30+ days)', () => {
      const artefacts = [
        {
          type: 'raid_log' as ArtefactType,
          content: {
            items: [
              {
                id: 'R-002',
                type: 'issue',
                title: 'Very stale issue',
                description: 'An old issue',
                severity: 'critical',
                status: 'mitigating',
                owner: 'PM',
                raisedDate: daysAgo(60),
                source: 'agent_detected',
                lastReviewed: daysAgo(35),
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('critical');
      expect(warnings[0].daysSinceReview).toBe(35);
    });

    it('skips resolved and closed RAID items', () => {
      const artefacts = [
        {
          type: 'raid_log' as ArtefactType,
          content: {
            items: [
              {
                id: 'R-003',
                type: 'risk',
                title: 'Resolved risk',
                description: 'Already resolved',
                severity: 'high',
                status: 'resolved',
                owner: 'PM',
                raisedDate: daysAgo(60),
                source: 'user_added',
                lastReviewed: daysAgo(50),
              },
              {
                id: 'R-004',
                type: 'issue',
                title: 'Closed issue',
                description: 'Already closed',
                severity: 'medium',
                status: 'closed',
                owner: 'PM',
                raisedDate: daysAgo(60),
                source: 'user_added',
                lastReviewed: daysAgo(50),
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(0);
    });
  });

  // Blocker tests
  describe('delivery_state blocker stale detection', () => {
    it('detects warning-level stale blockers (7+ days)', () => {
      const artefacts = [
        {
          type: 'delivery_state' as ArtefactType,
          content: {
            blockers: [
              {
                id: 'B-001',
                description: 'API dependency delayed',
                owner: 'Backend team',
                raisedDate: daysAgo(10),
                severity: 'high',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].artefactType).toBe('delivery_state');
      expect(warnings[0].itemId).toBe('B-001');
      expect(warnings[0].daysSinceReview).toBe(10);
    });

    it('detects critical-level stale blockers (14+ days)', () => {
      const artefacts = [
        {
          type: 'delivery_state' as ArtefactType,
          content: {
            blockers: [
              {
                id: 'B-002',
                description: 'Vendor contract not signed',
                owner: 'Legal',
                raisedDate: daysAgo(20),
                severity: 'high',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('critical');
      expect(warnings[0].daysSinceReview).toBe(20);
    });

    it('does not flag fresh blockers', () => {
      const artefacts = [
        {
          type: 'delivery_state' as ArtefactType,
          content: {
            blockers: [
              {
                id: 'B-003',
                description: 'Just raised yesterday',
                owner: 'PM',
                raisedDate: daysAgo(1),
                severity: 'medium',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(0);
    });
  });

  // Decision log tests
  describe('decision_log stale detection', () => {
    it('detects stale active decisions (60+ days)', () => {
      const artefacts = [
        {
          type: 'decision_log' as ArtefactType,
          content: {
            decisions: [
              {
                id: 'D-001',
                title: 'Use React for frontend',
                context: 'Framework selection',
                optionsConsidered: [
                  { option: 'React', pros: ['Popular'], cons: [] },
                ],
                decision: 'React',
                rationale: 'Team familiarity',
                madeBy: 'user',
                date: daysAgo(65),
                status: 'active',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].artefactType).toBe('decision_log');
      expect(warnings[0].itemId).toBe('D-001');
    });

    it('skips non-active decisions', () => {
      const artefacts = [
        {
          type: 'decision_log' as ArtefactType,
          content: {
            decisions: [
              {
                id: 'D-002',
                title: 'Old superseded decision',
                context: 'Was replaced',
                optionsConsidered: [],
                decision: 'X',
                rationale: 'Y',
                madeBy: 'agent',
                date: daysAgo(90),
                status: 'superseded',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(0);
    });

    it('does not flag recent active decisions', () => {
      const artefacts = [
        {
          type: 'decision_log' as ArtefactType,
          content: {
            decisions: [
              {
                id: 'D-003',
                title: 'Recent decision',
                context: 'Just decided',
                optionsConsidered: [],
                decision: 'Go with plan A',
                rationale: 'Best option',
                madeBy: 'user',
                date: daysAgo(10),
                status: 'active',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(0);
    });
  });

  // Sorting and multiple artefacts
  describe('sorting and multiple artefact types', () => {
    it('sorts warnings by severity (critical first)', () => {
      const artefacts = [
        {
          type: 'raid_log' as ArtefactType,
          content: {
            items: [
              {
                id: 'R-W',
                type: 'risk',
                title: 'Warning risk',
                description: 'Stale',
                severity: 'medium',
                status: 'open',
                owner: 'PM',
                raisedDate: daysAgo(20),
                source: 'user_added',
                lastReviewed: daysAgo(16),
              },
            ],
          },
        },
        {
          type: 'delivery_state' as ArtefactType,
          content: {
            blockers: [
              {
                id: 'B-C',
                description: 'Critical blocker',
                owner: 'Team',
                raisedDate: daysAgo(20),
                severity: 'high',
              },
            ],
          },
        },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(2);
      expect(warnings[0].severity).toBe('critical');
      expect(warnings[0].itemId).toBe('B-C');
      expect(warnings[1].severity).toBe('warning');
      expect(warnings[1].itemId).toBe('R-W');
    });

    it('handles artefacts with empty content gracefully', () => {
      const artefacts = [
        { type: 'raid_log' as ArtefactType, content: {} },
        { type: 'delivery_state' as ArtefactType, content: {} },
        { type: 'decision_log' as ArtefactType, content: {} },
        { type: 'backlog_summary' as ArtefactType, content: {} },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(0);
    });

    it('handles artefacts with null content items gracefully', () => {
      const artefacts = [
        { type: 'raid_log' as ArtefactType, content: { items: null } },
        { type: 'delivery_state' as ArtefactType, content: { blockers: null } },
        { type: 'decision_log' as ArtefactType, content: { decisions: null } },
      ];

      const warnings = detectStaleItems(artefacts, NOW);
      expect(warnings).toHaveLength(0);
    });
  });

  it('uses current date when no date is provided', () => {
    const artefacts = [
      {
        type: 'delivery_state' as ArtefactType,
        content: {
          blockers: [
            {
              id: 'B-NOW',
              description: 'Old blocker',
              owner: 'PM',
              raisedDate: '2020-01-01T00:00:00.000Z',
              severity: 'high',
            },
          ],
        },
      },
    ];

    // No `now` argument — uses real current date
    const warnings = detectStaleItems(artefacts);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe('critical');
  });
});
