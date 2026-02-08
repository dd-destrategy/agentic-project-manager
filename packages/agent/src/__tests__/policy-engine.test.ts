import { describe, it, expect } from 'vitest';
import {
  evaluatePolicy,
  describeAutonomyCapabilities,
} from '../tools/policy-engine.js';
import {
  jiraSearchIssues,
  jiraAddComment,
  jiraTransitionIssue,
  jiraCreateIssue,
  outlookSendEmail,
  artefactUpdate,
  artefactRevert,
  eventLog,
} from '../tools/catalogue.js';
import type { ToolExecutionContext } from '../tools/types.js';

const baseCtx: ToolExecutionContext = {
  isBackground: false,
  userApproved: false,
  holdQueueApproved: false,
};

describe('evaluatePolicy', () => {
  describe('observe mode', () => {
    it('permits read-only tools', () => {
      const decision = evaluatePolicy(jiraSearchIssues, 'observe', baseCtx);
      expect(decision.permitted).toBe(true);
      expect(decision.action).toBe('execute');
    });

    it('denies auto-execute tools', () => {
      const decision = evaluatePolicy(artefactUpdate, 'observe', baseCtx);
      expect(decision.permitted).toBe(false);
      expect(decision.action).toBe('deny');
    });

    it('denies hold-queue tools', () => {
      const decision = evaluatePolicy(jiraTransitionIssue, 'observe', baseCtx);
      expect(decision.permitted).toBe(false);
    });

    it('denies requires-approval tools', () => {
      const decision = evaluatePolicy(jiraCreateIssue, 'observe', baseCtx);
      expect(decision.permitted).toBe(false);
    });
  });

  describe('maintain mode', () => {
    it('permits read-only tools', () => {
      const decision = evaluatePolicy(jiraSearchIssues, 'maintain', baseCtx);
      expect(decision.permitted).toBe(true);
    });

    it('permits auto-execute tools (artefact updates, event logging)', () => {
      const decision = evaluatePolicy(artefactUpdate, 'maintain', baseCtx);
      expect(decision.permitted).toBe(true);
      expect(decision.action).toBe('execute');
    });

    it('permits event logging', () => {
      const decision = evaluatePolicy(eventLog, 'maintain', baseCtx);
      expect(decision.permitted).toBe(true);
    });

    it('escalates hold-queue tools (cannot send comms)', () => {
      const decision = evaluatePolicy(outlookSendEmail, 'maintain', baseCtx);
      expect(decision.permitted).toBe(false);
      expect(decision.action).toBe('escalate');
    });

    it('escalates requires-approval tools', () => {
      const decision = evaluatePolicy(jiraCreateIssue, 'maintain', baseCtx);
      expect(decision.permitted).toBe(false);
      expect(decision.action).toBe('escalate');
    });
  });

  describe('act mode', () => {
    it('permits read-only tools', () => {
      const decision = evaluatePolicy(jiraSearchIssues, 'act', baseCtx);
      expect(decision.permitted).toBe(true);
    });

    it('permits auto-execute tools', () => {
      const decision = evaluatePolicy(jiraAddComment, 'act', baseCtx);
      expect(decision.permitted).toBe(true);
    });

    it('holds hold-queue tools with correct duration', () => {
      const decision = evaluatePolicy(jiraTransitionIssue, 'act', baseCtx);
      expect(decision.permitted).toBe(true);
      expect(decision.action).toBe('hold');
      expect(decision.holdMinutes).toBe(5);
    });

    it('holds email with 30-min duration', () => {
      const decision = evaluatePolicy(outlookSendEmail, 'act', baseCtx);
      expect(decision.permitted).toBe(true);
      expect(decision.action).toBe('hold');
      expect(decision.holdMinutes).toBe(30);
    });

    it('escalates requires-approval tools', () => {
      const decision = evaluatePolicy(jiraCreateIssue, 'act', baseCtx);
      expect(decision.permitted).toBe(false);
      expect(decision.action).toBe('escalate');
    });

    it('escalates artefact revert', () => {
      const decision = evaluatePolicy(artefactRevert, 'act', baseCtx);
      expect(decision.permitted).toBe(false);
      expect(decision.action).toBe('escalate');
    });
  });

  describe('pre-approval overrides', () => {
    it('permits hold-queue tools when user approved', () => {
      const decision = evaluatePolicy(outlookSendEmail, 'act', {
        ...baseCtx,
        userApproved: true,
      });
      expect(decision.permitted).toBe(true);
      expect(decision.action).toBe('execute');
    });

    it('permits requires-approval tools when user approved', () => {
      const decision = evaluatePolicy(jiraCreateIssue, 'act', {
        ...baseCtx,
        userApproved: true,
      });
      expect(decision.permitted).toBe(true);
    });

    it('permits hold-queue tools when hold queue approved', () => {
      const decision = evaluatePolicy(jiraTransitionIssue, 'maintain', {
        ...baseCtx,
        holdQueueApproved: true,
      });
      expect(decision.permitted).toBe(true);
    });
  });

  describe('background cycle restrictions', () => {
    it('denies email sending in background', () => {
      const decision = evaluatePolicy(outlookSendEmail, 'act', {
        ...baseCtx,
        isBackground: true,
      });
      expect(decision.permitted).toBe(false);
      expect(decision.reason).toContain('background');
    });

    it('denies ticket creation in background', () => {
      const decision = evaluatePolicy(jiraCreateIssue, 'act', {
        ...baseCtx,
        isBackground: true,
      });
      expect(decision.permitted).toBe(false);
    });

    it('permits artefact updates in background', () => {
      const decision = evaluatePolicy(artefactUpdate, 'act', {
        ...baseCtx,
        isBackground: true,
      });
      expect(decision.permitted).toBe(true);
    });

    it('permits event logging in background', () => {
      const decision = evaluatePolicy(eventLog, 'act', {
        ...baseCtx,
        isBackground: true,
      });
      expect(decision.permitted).toBe(true);
    });
  });
});

describe('describeAutonomyCapabilities', () => {
  it('observe mode has only read capabilities', () => {
    const caps = describeAutonomyCapabilities('observe');
    expect(caps.canDo.length).toBe(1);
    expect(caps.cannotDo.length).toBeGreaterThan(0);
    expect(caps.holdQueue.length).toBe(0);
  });

  it('maintain mode adds artefact writes', () => {
    const caps = describeAutonomyCapabilities('maintain');
    expect(caps.canDo.length).toBe(2);
    expect(caps.holdQueue.length).toBe(0);
  });

  it('act mode adds hold queue', () => {
    const caps = describeAutonomyCapabilities('act');
    expect(caps.canDo.length).toBe(2);
    expect(caps.holdQueue.length).toBe(1);
  });
});
