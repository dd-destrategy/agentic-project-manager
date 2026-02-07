/**
 * Tests for applyExtractedItem
 *
 * Validates transformation of extracted items into project artefacts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyExtractedItem } from './apply-extracted-item.js';
import { setDynamoDBClient } from './updater.js';
import type { ExtractedItem } from '../db/repositories/extracted-item.js';
import type { RaidLogContent, DecisionLogContent } from '../types/index.js';

// ============================================================================
// Mock DynamoDB
// ============================================================================

const mockDbOperations = {
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  queryGSI1: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = mockDbOperations as any;

// ============================================================================
// Fixtures
// ============================================================================

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';

function makeExtractedItem(
  overrides: Partial<ExtractedItem> = {}
): ExtractedItem {
  return {
    id: 'item-1',
    sessionId: 'sess-1',
    messageId: 'msg-1',
    type: 'risk',
    title: 'Budget overrun risk',
    content: 'The project may exceed its budget by 20%.',
    targetArtefact: 'raid_log',
    priority: 'high',
    status: 'approved',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

const existingRaidLog: RaidLogContent = {
  items: [
    {
      id: 'R-existing',
      type: 'risk',
      title: 'Existing risk',
      description: 'An existing risk item',
      severity: 'medium',
      status: 'open',
      owner: 'PM',
      raisedDate: '2024-01-01T00:00:00.000Z',
      source: 'agent_detected',
      lastReviewed: '2024-01-01T00:00:00.000Z',
    },
  ],
};

const existingDecisionLog: DecisionLogContent = {
  decisions: [
    {
      id: 'DEC-existing',
      title: 'Existing decision',
      context: 'Some context',
      decision: 'We decided X',
      rationale: 'Because Y',
      optionsConsidered: [{ option: 'X', pros: ['Good'], cons: ['Bad'] }],
      madeBy: 'user',
      date: '2024-01-01T00:00:00.000Z',
      status: 'active',
    },
  ],
};

// ============================================================================
// Tests
// ============================================================================

describe('applyExtractedItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbOperations.get.mockResolvedValue(null);
    mockDbOperations.put.mockResolvedValue(undefined);
    setDynamoDBClient(mockDb);
  });

  describe('validation', () => {
    it('rejects items that are not approved', async () => {
      const item = makeExtractedItem({ status: 'pending_review' });
      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toContain("must be in 'approved' status");
      expect(result.error).toContain('pending_review');
    });

    it('rejects dismissed items', async () => {
      const item = makeExtractedItem({ status: 'dismissed' });
      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toContain("must be in 'approved' status");
    });

    it('rejects when projectId is missing', async () => {
      const item = makeExtractedItem();
      const result = await applyExtractedItem(item, '', mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toContain('projectId is required');
    });
  });

  describe('risk -> RAID log', () => {
    it('creates a new RAID item from a risk extraction', async () => {
      // Return existing RAID log so merge works
      mockDbOperations.get.mockResolvedValue({
        id: 'artefact-1',
        projectId: PROJECT_ID,
        type: 'raid_log',
        content: existingRaidLog,
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const item = makeExtractedItem({
        type: 'risk',
        title: 'Budget overrun risk',
        content: 'Budget may exceed by 20%',
        priority: 'high',
        targetArtefact: 'raid_log',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(true);
      expect(result.artefactType).toBe('raid_log');
      expect(result.itemId).toBe('item-1');

      // Verify put was called with merged content
      expect(mockDbOperations.put).toHaveBeenCalled();
      const putCall = mockDbOperations.put.mock.calls[0][0];
      const content = putCall.content as RaidLogContent;

      // Should have the existing item plus the new one
      expect(content.items.length).toBe(2);

      // Find the new item (the one that's not R-existing)
      const newItem = content.items.find((i) => i.id !== 'R-existing');
      expect(newItem).toBeDefined();
      expect(newItem!.id).toMatch(/^R-/);
      expect(newItem!.type).toBe('risk');
      expect(newItem!.title).toBe('Budget overrun risk');
      expect(newItem!.description).toBe('Budget may exceed by 20%');
      expect(newItem!.severity).toBe('high');
      expect(newItem!.status).toBe('open');
      expect(newItem!.owner).toBe('PM');
      expect(newItem!.source).toBe('user_added');
    });

    it('maps action_item to RAID issue type', async () => {
      mockDbOperations.get.mockResolvedValue({
        id: 'artefact-1',
        projectId: PROJECT_ID,
        type: 'raid_log',
        content: existingRaidLog,
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const item = makeExtractedItem({
        type: 'action_item',
        title: 'Follow up with vendor',
        content: 'Need to chase vendor response',
        targetArtefact: 'raid_log',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(true);
      const putCall = mockDbOperations.put.mock.calls[0][0];
      const content = putCall.content as RaidLogContent;
      const newItem = content.items.find((i) => i.id !== 'R-existing');
      expect(newItem!.type).toBe('issue');
    });

    it('maps blocker to RAID issue type', async () => {
      mockDbOperations.get.mockResolvedValue({
        id: 'artefact-1',
        projectId: PROJECT_ID,
        type: 'raid_log',
        content: existingRaidLog,
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const item = makeExtractedItem({
        type: 'blocker',
        title: 'API access blocked',
        content: 'We cannot access the external API',
        targetArtefact: 'raid_log',
        priority: 'critical',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(true);
      const putCall = mockDbOperations.put.mock.calls[0][0];
      const content = putCall.content as RaidLogContent;
      const newItem = content.items.find((i) => i.id !== 'R-existing');
      expect(newItem!.type).toBe('issue');
      expect(newItem!.severity).toBe('critical');
    });

    it('maps dependency to RAID dependency type', async () => {
      mockDbOperations.get.mockResolvedValue({
        id: 'artefact-1',
        projectId: PROJECT_ID,
        type: 'raid_log',
        content: existingRaidLog,
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const item = makeExtractedItem({
        type: 'dependency',
        title: 'Depends on Team B API',
        content: 'Need Team B API ready by March',
        targetArtefact: 'raid_log',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(true);
      const putCall = mockDbOperations.put.mock.calls[0][0];
      const content = putCall.content as RaidLogContent;
      const newItem = content.items.find((i) => i.id !== 'R-existing');
      expect(newItem!.type).toBe('dependency');
    });
  });

  describe('decision -> decision log', () => {
    it('creates a new decision log entry', async () => {
      mockDbOperations.get.mockResolvedValue({
        id: 'artefact-2',
        projectId: PROJECT_ID,
        type: 'decision_log',
        content: existingDecisionLog,
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const item = makeExtractedItem({
        type: 'decision',
        title: 'Use PostgreSQL for storage',
        content:
          'Team decided to use PostgreSQL over MySQL for better JSON support.',
        targetArtefact: 'decision_log',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(true);
      expect(result.artefactType).toBe('decision_log');

      const putCall = mockDbOperations.put.mock.calls[0][0];
      const content = putCall.content as DecisionLogContent;

      expect(content.decisions.length).toBe(2);

      const newDecision = content.decisions.find(
        (d) => d.id !== 'DEC-existing'
      );
      expect(newDecision).toBeDefined();
      expect(newDecision!.id).toMatch(/^DEC-/);
      expect(newDecision!.title).toBe('Use PostgreSQL for storage');
      expect(newDecision!.context).toBe(
        'Team decided to use PostgreSQL over MySQL for better JSON support.'
      );
      expect(newDecision!.decision).toBe('Use PostgreSQL for storage');
      expect(newDecision!.madeBy).toBe('user');
      expect(newDecision!.status).toBe('active');
      expect(newDecision!.optionsConsidered).toHaveLength(1);
      expect(newDecision!.optionsConsidered[0].option).toBe(
        'Use PostgreSQL for storage'
      );
    });
  });

  describe('status_update -> delivery_state', () => {
    it('adds a next action to delivery state', async () => {
      mockDbOperations.get.mockResolvedValue({
        id: 'artefact-3',
        projectId: PROJECT_ID,
        type: 'delivery_state',
        content: {
          overallStatus: 'green',
          statusSummary: 'All good',
          milestones: [],
          blockers: [],
          keyMetrics: {
            velocityTrend: 'stable',
            avgCycleTimeDays: 5,
            openBlockers: 0,
            activeRisks: 1,
          },
          nextActions: ['Existing action'],
        },
        version: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      const item = makeExtractedItem({
        type: 'status_update',
        title: 'Sprint planning completed',
        content: 'Sprint 5 planning done, 25 story points committed',
        targetArtefact: 'delivery_state',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(true);
      expect(result.artefactType).toBe('delivery_state');
    });
  });

  describe('error handling', () => {
    it('returns error for unsupported backlog_summary target', async () => {
      const item = makeExtractedItem({
        targetArtefact: 'backlog_summary',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be applied directly');
    });

    it('creates RAID log if none exists via upsert', async () => {
      // First get returns null (no existing artefact), subsequent gets also null
      mockDbOperations.get.mockResolvedValue(null);

      const item = makeExtractedItem({
        type: 'risk',
        targetArtefact: 'raid_log',
      });

      const result = await applyExtractedItem(item, PROJECT_ID, mockDb);

      // Should succeed via the upsert fallback
      expect(result.success).toBe(true);
      expect(mockDbOperations.put).toHaveBeenCalled();
    });
  });
});
