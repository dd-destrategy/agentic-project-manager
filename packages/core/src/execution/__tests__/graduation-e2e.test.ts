/**
 * Graduation end-to-end tests
 *
 * Tests the graduation flow: consecutive approvals advance tiers,
 * cancellations reset progress, and full graduation from tier 0 to tier 3.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DynamoDBClient } from '../../db/client.js';
import {
  GraduationStateRepository,
  GRADUATION_THRESHOLDS,
  GRADUATION_HOLD_TIMES,
  type GraduationState,
  type GraduationTier,
} from '../../db/repositories/graduation-state.js';
import type { HeldActionType } from '../../db/repositories/held-action.js';

/**
 * Creates a real GraduationStateRepository with an in-memory store,
 * bypassing DynamoDB but exercising the actual tier calculation logic.
 */
function createInMemoryGraduationRepo(): GraduationStateRepository {
  const store = new Map<string, GraduationState>();

  const mockDb = {
    get: vi.fn(async (pk: string, sk: string) => {
      const key = `${pk}#${sk}`;
      const item = store.get(key);
      if (!item) return null;
      return {
        PK: pk,
        SK: sk,
        ...item,
      };
    }),
    put: vi.fn(async (item: Record<string, unknown>) => {
      const pk = item.PK as string;
      const sk = item.SK as string;
      const key = `${pk}#${sk}`;
      store.set(key, {
        projectId: item.projectId as string,
        actionType: item.actionType as HeldActionType,
        consecutiveApprovals: item.consecutiveApprovals as number,
        tier: item.tier as GraduationTier,
        lastApprovalAt: item.lastApprovalAt as string | undefined,
        lastCancellationAt: item.lastCancellationAt as string | undefined,
        updatedAt: item.updatedAt as string,
      });
    }),
    query: vi.fn(async () => ({ items: [], lastKey: undefined })),
    queryGSI1: vi.fn(async () => ({ items: [], lastKey: undefined })),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as DynamoDBClient;

  return new GraduationStateRepository(mockDb);
}

describe('Graduation end-to-end flow', () => {
  let graduationRepo: GraduationStateRepository;
  const projectId = 'test-project';
  const actionType: HeldActionType = 'email_stakeholder';

  beforeEach(() => {
    graduationRepo = createInMemoryGraduationRepo();
  });

  describe('consecutive approvals advance graduation tier', () => {
    it('starts at tier 0 with 0 approvals', async () => {
      const state = await graduationRepo.getOrCreate(projectId, actionType);

      expect(state.tier).toBe(0);
      expect(state.consecutiveApprovals).toBe(0);
    });

    it('remains at tier 0 after 4 approvals', async () => {
      let state: GraduationState;

      for (let i = 0; i < 4; i++) {
        state = await graduationRepo.recordApproval(projectId, actionType);
      }

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(0);
      expect(state.consecutiveApprovals).toBe(4);
    });

    it('advances to tier 1 after 5 consecutive approvals', async () => {
      let state: GraduationState;

      for (let i = 0; i < GRADUATION_THRESHOLDS[1]; i++) {
        state = await graduationRepo.recordApproval(projectId, actionType);
      }

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(1);
      expect(state.consecutiveApprovals).toBe(5);
    });

    it('advances to tier 2 after 10 consecutive approvals', async () => {
      let state: GraduationState;

      for (let i = 0; i < GRADUATION_THRESHOLDS[2]; i++) {
        state = await graduationRepo.recordApproval(projectId, actionType);
      }

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(2);
      expect(state.consecutiveApprovals).toBe(10);
    });
  });

  describe('cancellation resets approval count', () => {
    it('resets consecutive approvals to 0 on cancellation', async () => {
      // Build up 4 approvals
      for (let i = 0; i < 4; i++) {
        await graduationRepo.recordApproval(projectId, actionType);
      }

      let state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.consecutiveApprovals).toBe(4);

      // Cancel — resets progress
      await graduationRepo.recordCancellation(projectId, actionType);

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.consecutiveApprovals).toBe(0);
      expect(state.lastCancellationAt).toBeDefined();
    });

    it('preserves tier after cancellation (no demotion)', async () => {
      // Reach tier 1 (5 approvals)
      for (let i = 0; i < GRADUATION_THRESHOLDS[1]; i++) {
        await graduationRepo.recordApproval(projectId, actionType);
      }

      let state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(1);

      // Cancel — tier stays at 1, approvals reset to 0
      await graduationRepo.recordCancellation(projectId, actionType);

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(1);
      expect(state.consecutiveApprovals).toBe(0);
    });

    it('requires re-earning approvals after cancellation', async () => {
      // Reach 4 approvals (one short of tier 1)
      for (let i = 0; i < 4; i++) {
        await graduationRepo.recordApproval(projectId, actionType);
      }

      // Cancel
      await graduationRepo.recordCancellation(projectId, actionType);

      // 1 more approval is not enough — need 5 again from scratch
      await graduationRepo.recordApproval(projectId, actionType);

      const state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(0);
      expect(state.consecutiveApprovals).toBe(1);
    });
  });

  describe('full graduation from tier 0 to tier 3', () => {
    it('completes full graduation with 20 consecutive approvals', async () => {
      let state: GraduationState;
      const tierTransitions: Array<{ approval: number; tier: number }> = [];

      for (let i = 1; i <= GRADUATION_THRESHOLDS[3]; i++) {
        state = await graduationRepo.recordApproval(projectId, actionType);

        // Record tier transitions
        if (
          i === GRADUATION_THRESHOLDS[1] ||
          i === GRADUATION_THRESHOLDS[2] ||
          i === GRADUATION_THRESHOLDS[3]
        ) {
          tierTransitions.push({ approval: i, tier: state.tier });
        }
      }

      // Verify all tier transitions happened at the right thresholds
      expect(tierTransitions).toEqual([
        { approval: 5, tier: 1 },
        { approval: 10, tier: 2 },
        { approval: 20, tier: 3 },
      ]);

      // Final state
      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(3);
      expect(state.consecutiveApprovals).toBe(20);

      // Verify hold time for tier 3 is immediate
      expect(GRADUATION_HOLD_TIMES[3]).toBe(0);
    });

    it('holds at correct times per tier', () => {
      // Verify the hold time configuration
      expect(GRADUATION_HOLD_TIMES[0]).toBe(30); // 30 minutes
      expect(GRADUATION_HOLD_TIMES[1]).toBe(15); // 15 minutes
      expect(GRADUATION_HOLD_TIMES[2]).toBe(5); // 5 minutes
      expect(GRADUATION_HOLD_TIMES[3]).toBe(0); // Immediate
    });

    it('handles graduation with intermittent cancellations', async () => {
      // Reach tier 1 (5 approvals)
      for (let i = 0; i < GRADUATION_THRESHOLDS[1]; i++) {
        await graduationRepo.recordApproval(projectId, actionType);
      }

      let state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(1);

      // Cancel — resets approvals but keeps tier 1
      await graduationRepo.recordCancellation(projectId, actionType);

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(1);
      expect(state.consecutiveApprovals).toBe(0);

      // Continue building towards tier 2 — need 10 more from 0
      for (let i = 0; i < GRADUATION_THRESHOLDS[2]; i++) {
        await graduationRepo.recordApproval(projectId, actionType);
      }

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(2);
      expect(state.consecutiveApprovals).toBe(10);

      // Continue to tier 3 — need 20 total from 0, so 10 more
      for (let i = 0; i < 10; i++) {
        await graduationRepo.recordApproval(projectId, actionType);
      }

      state = await graduationRepo.getOrCreate(projectId, actionType);
      expect(state.tier).toBe(3);
      expect(state.consecutiveApprovals).toBe(20);
    });
  });

  describe('independent action types', () => {
    it('tracks graduation state independently per action type', async () => {
      const emailType: HeldActionType = 'email_stakeholder';
      const jiraType: HeldActionType = 'jira_status_change';

      // 5 email approvals -> tier 1
      for (let i = 0; i < GRADUATION_THRESHOLDS[1]; i++) {
        await graduationRepo.recordApproval(projectId, emailType);
      }

      // 3 jira approvals -> still tier 0
      for (let i = 0; i < 3; i++) {
        await graduationRepo.recordApproval(projectId, jiraType);
      }

      const emailState = await graduationRepo.getOrCreate(projectId, emailType);
      const jiraState = await graduationRepo.getOrCreate(projectId, jiraType);

      expect(emailState.tier).toBe(1);
      expect(emailState.consecutiveApprovals).toBe(5);

      expect(jiraState.tier).toBe(0);
      expect(jiraState.consecutiveApprovals).toBe(3);
    });
  });
});
