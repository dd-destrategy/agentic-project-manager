import { describe, it, expect } from 'vitest';
import {
  classifyMode,
  shouldActivateSceptic,
} from '../ensemble/mode-classifier.js';

describe('classifyMode', () => {
  const baseCtx = {
    userMessage: '',
    isBackground: false,
    pendingEscalations: 0,
    hasPendingDraft: false,
    recentTurns: 0,
  };

  describe('background cycles', () => {
    it('classifies background invocations as analysis', () => {
      const result = classifyMode({
        ...baseCtx,
        isBackground: true,
        userMessage: 'anything',
      });
      expect(result.mode).toBe('analysis');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('pre-mortem mode', () => {
    it.each([
      'Run a pre-mortem on the March launch',
      'Stress-test this plan',
      'What could go wrong with this approach?',
      "Play devil's advocate",
      'What am I not seeing?',
      'Challenge this timeline',
      'Poke holes in this plan',
      'Worst-case scenario for the beta launch',
    ])('classifies "%s" as pre_mortem', (message) => {
      const result = classifyMode({ ...baseCtx, userMessage: message });
      expect(result.mode).toBe('pre_mortem');
    });
  });

  describe('retrospective mode', () => {
    it.each([
      'Run a retro on sprint 14',
      'What did we learn from the vendor delay?',
      'Lessons learned from the beta launch',
      'What went well this sprint?',
      'Post-mortem on the outage',
      'Looking back at the Q1 milestone',
    ])('classifies "%s" as retrospective', (message) => {
      const result = classifyMode({ ...baseCtx, userMessage: message });
      expect(result.mode).toBe('retrospective');
    });
  });

  describe('decision mode', () => {
    it.each([
      'Should we push the launch to April?',
      'Decide between hiring a contractor or reducing scope',
      "What's the best approach for the API migration?",
      'Trade-offs between option A and B',
      'I need a recommendation on the vendor situation',
      'How should I handle the budget overrun?',
      'Should the team rescope the sprint?',
    ])('classifies "%s" as decision', (message) => {
      const result = classifyMode({ ...baseCtx, userMessage: message });
      expect(result.mode).toBe('decision');
    });
  });

  describe('action mode', () => {
    it.each([
      'Draft an email to Sarah about the delay',
      'Send a notification to the team',
      'Create a ticket for the new requirement',
      'Update the RAID log with the new blocker',
      'Add a comment to ATL-342',
      'Transition ATL-350 to In Progress',
      'Chase up the design vendor',
      'Follow up with DevOps on the access issue',
    ])('classifies "%s" as action', (message) => {
      const result = classifyMode({ ...baseCtx, userMessage: message });
      expect(result.mode).toBe('action');
    });

    it('classifies approval of pending draft as action', () => {
      const result = classifyMode({
        ...baseCtx,
        userMessage: 'Approve',
        hasPendingDraft: true,
      });
      expect(result.mode).toBe('action');
    });
  });

  describe('analysis mode', () => {
    it.each([
      "What's the state of Project Atlas?",
      "How's the project going?",
      'Show me the velocity trend',
      'Summarise what happened today',
      'Catch me up',
      'What did I miss?',
      'Risk assessment for the beta milestone',
      'Backlog health audit',
      'Prep me for the steering committee',
      'How many open blockers on Atlas?',
      'Cross-project dependency check',
      'Weekly status report draft',
    ])('classifies "%s" as analysis', (message) => {
      const result = classifyMode({ ...baseCtx, userMessage: message });
      expect(result.mode).toBe('analysis');
    });
  });

  describe('quick query fallback', () => {
    it('classifies short ambiguous messages as quick_query', () => {
      const result = classifyMode({ ...baseCtx, userMessage: 'Hello' });
      expect(result.mode).toBe('quick_query');
    });

    it('classifies longer ambiguous messages as analysis', () => {
      const result = classifyMode({
        ...baseCtx,
        userMessage:
          'I was thinking about the project and wanted to explore some ideas around the timeline',
      });
      expect(result.mode).toBe('analysis');
    });
  });
});

describe('shouldActivateSceptic', () => {
  const baseCtx = {
    userMessage: '',
    mode: 'analysis' as const,
    challengeCooldownMs: 10 * 60 * 1000,
  };

  it('returns null if Sceptic already included in mode', () => {
    const result = shouldActivateSceptic({ ...baseCtx, mode: 'decision' });
    expect(result).toBeNull();
  });

  it('returns null if Sceptic already included in pre_mortem', () => {
    const result = shouldActivateSceptic({ ...baseCtx, mode: 'pre_mortem' });
    expect(result).toBeNull();
  });

  it('activates on velocity gap with confidence expression', () => {
    const result = shouldActivateSceptic({
      ...baseCtx,
      userMessage: "I think we'll make it by March",
      velocityGapPercent: 25,
    });
    expect(result).toBe('timeline_confidence');
  });

  it('does not activate on velocity gap without confidence expression', () => {
    const result = shouldActivateSceptic({
      ...baseCtx,
      userMessage: 'Show me the velocity trend',
      velocityGapPercent: 25,
    });
    expect(result).toBeNull();
  });

  it('activates on stale blocker', () => {
    const result = shouldActivateSceptic({
      ...baseCtx,
      userMessage: 'anything',
      stalestBlockerDays: 5,
    });
    expect(result).toBe('stale_blocker');
  });

  it('activates on scope creep', () => {
    const result = shouldActivateSceptic({
      ...baseCtx,
      userMessage: 'anything',
      scopeAddedWithoutTradeoff: 4,
    });
    expect(result).toBe('scope_creep');
  });

  it('respects cooldown period', () => {
    const result = shouldActivateSceptic({
      ...baseCtx,
      userMessage: "We'll make the deadline",
      velocityGapPercent: 30,
      lastChallengeMs: Date.now() - 1000, // 1 second ago
    });
    expect(result).toBeNull();
  });

  it('activates after cooldown expires', () => {
    const result = shouldActivateSceptic({
      ...baseCtx,
      userMessage: "We'll make the deadline",
      velocityGapPercent: 30,
      lastChallengeMs: Date.now() - 20 * 60 * 1000, // 20 minutes ago
    });
    expect(result).toBe('timeline_confidence');
  });
});
