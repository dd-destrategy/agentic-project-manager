import { describe, it, expect, beforeEach } from 'vitest';
import { EnsembleOrchestrator } from '../ensemble/orchestrator.js';
import type { SessionState } from '../ensemble/orchestrator.js';
import { createTestLlm } from '../local/mock-llm.js';
import { MockToolExecutor } from '../local/mock-tools.js';
import { InMemoryStore } from '../memory/index.js';

describe('EnsembleOrchestrator', () => {
  let orchestrator: EnsembleOrchestrator;
  let llm: ReturnType<typeof createTestLlm>;
  let tools: MockToolExecutor;
  let memory: InMemoryStore;

  beforeEach(() => {
    llm = createTestLlm();
    tools = new MockToolExecutor();
    memory = new InMemoryStore();

    // Seed memory with project context
    memory.addMemory(
      'Project Atlas uses 2-week sprints starting on Mondays',
      'semantic'
    );
    memory.addMemory('Sarah Chen is the project sponsor', 'semantic');
    memory.setSessionSummary('Previous session: reviewed sprint progress');

    const session: SessionState = {
      sessionId: 'test-session-001',
      projectId: 'proj-atlas-001',
      turns: [],
    };

    orchestrator = new EnsembleOrchestrator({ llm, tools, memory, session });
  });

  describe('quick query mode (Operator only)', () => {
    it('processes short factual queries with single LLM call', async () => {
      const response = await orchestrator.processMessage('Hello');

      expect(response.mode).toBe('quick_query');
      expect(response.message).toBeDefined();
      expect(response.message.length).toBeGreaterThan(0);
      // Operator-only: single LLM call, no deliberation
      expect(response.deliberation).toBeUndefined();
      expect(response.showAttribution).toBe(false);
      expect(llm.getCallCount()).toBe(1);
    });
  });

  describe('analysis mode (Analyst + Historian)', () => {
    it('activates multi-persona reasoning for status queries', async () => {
      const response = await orchestrator.processMessage(
        "What's the state of Project Atlas?"
      );

      expect(response.mode).toBe('analysis');
      expect(response.message).toBeDefined();
      // Analysis mode has deliberation but no synthesis requirement
      expect(response.deliberation).toBeDefined();
      expect(
        response.deliberation!.contributions.length
      ).toBeGreaterThanOrEqual(2);
    });

    it('includes Analyst and Historian perspectives', async () => {
      const response = await orchestrator.processMessage(
        'Show me the velocity trend for the last 5 sprints'
      );

      expect(response.mode).toBe('analysis');
      const personaIds = response.deliberation!.contributions.map(
        (c) => c.personaId
      );
      expect(personaIds).toContain('analyst');
      expect(personaIds).toContain('historian');
      expect(personaIds).not.toContain('operator');
    });
  });

  describe('decision mode (full ensemble)', () => {
    it('activates all relevant personas for decisions', async () => {
      const response = await orchestrator.processMessage(
        'Should we push the beta launch to April?'
      );

      expect(response.mode).toBe('decision');
      expect(response.deliberation).toBeDefined();
      expect(response.showAttribution).toBe(true);

      const personaIds = response.deliberation!.contributions.map(
        (c) => c.personaId
      );
      expect(personaIds).toContain('analyst');
      expect(personaIds).toContain('sceptic');
      expect(personaIds).toContain('advocate');
      expect(personaIds).toContain('historian');
      // Synthesiser runs separately, not in contributions
    });

    it('uses Sonnet for Sceptic reasoning', async () => {
      await orchestrator.processMessage('Should we commit to March 15?');

      const sonnetCalls = llm.getCallsByModel('sonnet');
      // Sceptic uses Sonnet, Synthesiser uses Sonnet
      expect(sonnetCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('records synthesised recommendation', async () => {
      const response = await orchestrator.processMessage(
        'Should we delay the launch or reduce scope?'
      );

      expect(response.deliberation!.synthesisedRecommendation).toBeDefined();
      expect(
        response.deliberation!.synthesisedRecommendation!.length
      ).toBeGreaterThan(0);
    });
  });

  describe('action mode (Operator + Advocate)', () => {
    it('activates Operator and Advocate for communications', async () => {
      const response = await orchestrator.processMessage(
        'Draft an email to Sarah about the delay'
      );

      expect(response.mode).toBe('action');
      const personaIds = response.deliberation!.contributions.map(
        (c) => c.personaId
      );
      expect(personaIds).toContain('operator');
      expect(personaIds).toContain('advocate');
    });
  });

  describe('pre-mortem mode', () => {
    it('activates Sceptic-led analysis', async () => {
      const response = await orchestrator.processMessage(
        'Run a pre-mortem on the March launch'
      );

      expect(response.mode).toBe('pre_mortem');
      expect(response.showAttribution).toBe(true);

      const personaIds = response.deliberation!.contributions.map(
        (c) => c.personaId
      );
      expect(personaIds).toContain('sceptic');
      expect(personaIds).toContain('analyst');
      expect(personaIds).toContain('historian');
    });
  });

  describe('background cycles', () => {
    it('classifies background invocations as analysis', async () => {
      const response = await orchestrator.processMessage(
        'Run background monitoring cycle',
        { isBackground: true }
      );

      expect(response.mode).toBe('analysis');
    });
  });

  describe('session state', () => {
    it('records conversation turns', async () => {
      await orchestrator.processMessage('Hello');
      await orchestrator.processMessage("What's the status?");

      const session = orchestrator.getSession();
      expect(session.turns.length).toBe(4); // 2 user + 2 copilot
      expect(session.turns[0].role).toBe('user');
      expect(session.turns[1].role).toBe('copilot');
    });

    it('records events in memory', async () => {
      await orchestrator.processMessage("How's the project going?");

      const events = memory.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].event).toContain('project');
    });
  });

  describe('memory integration', () => {
    it('retrieves relevant memories for queries', async () => {
      const response = await orchestrator.processMessage(
        'Summarise what we know about Sarah Chen and her priorities'
      );

      // The LLM receives memory context about Sarah
      const calls = llm.getCalls();
      const hasMemoryContext = calls.some((c) =>
        c.systemPrompt.includes('Sarah Chen')
      );
      expect(hasMemoryContext).toBe(true);
    });

    it('includes session summary in context', async () => {
      await orchestrator.processMessage('Catch me up');

      const calls = llm.getCalls();
      const systemPrompt = calls[0].systemPrompt;
      expect(systemPrompt).toContain('Previous session');
    });
  });
});
