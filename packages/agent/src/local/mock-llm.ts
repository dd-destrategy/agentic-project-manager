/**
 * Mock LLM — Local Development
 *
 * Two modes:
 * 1. LIVE: Calls real Claude API (set ANTHROPIC_API_KEY env var)
 * 2. CANNED: Returns deterministic responses for testing
 *
 * Live mode gives production-parity reasoning. Canned mode gives
 * fast, free, deterministic tests. Toggle via constructor option.
 */

import type { LlmCall } from '../ensemble/orchestrator.js';

export type LlmMode = 'live' | 'canned';

interface MockLlmOptions {
  mode: LlmMode;
  apiKey?: string;
  /** Record all calls for assertion in tests */
  recordCalls?: boolean;
}

export interface RecordedCall {
  systemPrompt: string;
  userMessage: string;
  model: 'haiku' | 'sonnet';
  response: string;
  timestamp: number;
}

export class MockLlm implements LlmCall {
  private readonly mode: LlmMode;
  private readonly apiKey?: string;
  private readonly calls: RecordedCall[] = [];
  private readonly recordCalls: boolean;
  private cannedResponses = new Map<string, string>();

  constructor(options: MockLlmOptions) {
    this.mode = options.mode;
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.recordCalls = options.recordCalls ?? true;

    if (this.mode === 'live' && !this.apiKey) {
      throw new Error(
        'MockLlm in live mode requires ANTHROPIC_API_KEY environment variable or apiKey option'
      );
    }

    // Seed default canned responses
    this.seedCannedResponses();
  }

  async complete(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; model?: 'haiku' | 'sonnet' }
  ): Promise<string> {
    const model = options?.model ?? 'haiku';
    let response: string;

    if (this.mode === 'live') {
      response = await this.callClaudeApi(systemPrompt, userMessage, {
        model,
        maxTokens: options?.maxTokens ?? 1024,
      });
    } else {
      response = this.getCannedResponse(systemPrompt, userMessage);
    }

    if (this.recordCalls) {
      this.calls.push({
        systemPrompt,
        userMessage,
        model,
        response,
        timestamp: Date.now(),
      });
    }

    return response;
  }

  // ─── Live Mode: Real Claude API ────────────────────────────

  private async callClaudeApi(
    systemPrompt: string,
    userMessage: string,
    options: { model: 'haiku' | 'sonnet'; maxTokens: number }
  ): Promise<string> {
    const modelId =
      options.model === 'haiku'
        ? 'claude-haiku-4-5-20251001'
        : 'claude-sonnet-4-5-20250929';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: options.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');
  }

  // ─── Canned Mode: Deterministic Responses ──────────────────

  private getCannedResponse(systemPrompt: string, userMessage: string): string {
    // Check exact match first
    const exactKey = userMessage.trim().toLowerCase();
    if (this.cannedResponses.has(exactKey)) {
      return this.cannedResponses.get(exactKey)!;
    }

    // Check pattern matches
    for (const [pattern, response] of this.cannedResponses) {
      if (
        pattern.startsWith('re:') &&
        new RegExp(pattern.slice(3), 'i').test(userMessage)
      ) {
        return response;
      }
    }

    // Detect persona from system prompt and return persona-appropriate default
    if (systemPrompt.includes('Operator perspective')) {
      return 'Done. No issues found.';
    }
    if (systemPrompt.includes('Analyst perspective')) {
      return 'DATA: Sprint velocity: 25 points/sprint (3-sprint average). Trend: stable. 2 open blockers. RAID log: 3 high-severity items open.';
    }
    if (systemPrompt.includes('Sceptic perspective')) {
      return 'However, I must flag that the current velocity (25 pts) is 26% below the required rate (34 pts) to meet the deadline. The plan assumes recovery that historical data does not support. Have you considered the impact if the API dependency slips past 1 March?';
    }
    if (systemPrompt.includes('Advocate perspective')) {
      return "From the sponsor's perspective, transparency about the delay is preferable to a last-minute surprise. Sarah has a board presentation on 15 March and needs certainty by 1 March.";
    }
    if (systemPrompt.includes('Historian perspective')) {
      return 'This mirrors the situation on Project Beacon in November 2025. You chose to communicate proactively and reset the deadline to 19 November. The sponsor responded positively to the early warning. Outcome: delivered on revised date, stakeholder trust maintained.';
    }
    if (systemPrompt.includes('Synthesiser perspective')) {
      return 'Taking all perspectives into account, I recommend Option A (delay to 7 April). The Analyst data shows velocity cannot support March. The Sceptic highlights compound risk at ~85%. The Historian notes a similar delay on Beacon was well-received. The Advocate confirms Sarah values transparency. Confidence: moderate-high. The user decides.';
    }

    // Generic fallback
    return 'Project Atlas: Sprint 14 at 62% completion. 2 open blockers. Delivery state: Amber. No critical escalations pending.';
  }

  /**
   * Register a canned response for a specific input.
   * Use "re:" prefix for regex patterns.
   */
  setCannedResponse(input: string, response: string): void {
    this.cannedResponses.set(input.toLowerCase(), response);
  }

  private seedCannedResponses(): void {
    this.cannedResponses.set(
      "re:what's the (state|status)",
      'Project Atlas: Sprint 14 at 62% completion with 3 days remaining.\n\n2 blockers:\n1. ATL-342: API migration — blocked 3 days, assigned to DevOps\n2. ATL-350: Environment access — raised today, assigned to Jamie\n\nRAID log: 2 high-severity open risks.\nDelivery state: Amber (velocity declining).'
    );

    this.cannedResponses.set(
      're:how many (open|active).*blocker',
      '2 open blockers on Atlas:\n1. ATL-342: API migration (3 days, DevOps)\n2. ATL-350: Environment access (today, Jamie)'
    );

    this.cannedResponses.set(
      're:draft.*(email|message)',
      'Draft email prepared.\n\nTo: recipient@company.com\nSubject: Project Atlas — status update\n\nBody:\nThe sprint is at 62% completion with 2 active blockers requiring attention. A revised timeline assessment will follow by end of week.\n\nBest regards\n\n---\nTone: Professional, direct.\nHold: 5 minutes. [Approve] [Edit] [Cancel]'
    );

    this.cannedResponses.set(
      're:catch (me )?up',
      'Since your last session:\n\nCRITICAL:\n• ATL-350: New blocker — DevOps access policy change\n\nIMPORTANT:\n• ATL-341 moved to Done\n• ATL-345 re-estimated (5 → 8 points)\n\nROUTINE (handled):\n• Delivery state updated (68% → 63%)\n• RAID log updated: added I-019'
    );

    this.cannedResponses.set(
      're:pre[- ]?mortem',
      'Pre-mortem: Imagining it is 15 March and the launch has failed.\n\n1. API DEPENDENCY MISS (probability: 65%)\n   API v3 has no confirmed date. Last upstream update: 12 days ago.\n\n2. VELOCITY SHORTFALL (probability: 40%)\n   Current: 25 pts/sprint. Required: 34 pts/sprint. Gap: 36%.\n\n3. TESTING BOTTLENECK (probability: 35%)\n   QA capacity drops 50% in week 3 (leave).\n\nCompound probability of at least one failure: ~85%'
    );
  }

  // ─── Test Helpers ──────────────────────────────────────────

  getCalls(): RecordedCall[] {
    return [...this.calls];
  }

  getLastCall(): RecordedCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  clearCalls(): void {
    this.calls.length = 0;
  }

  getCallCount(): number {
    return this.calls.length;
  }

  getCallsByModel(model: 'haiku' | 'sonnet'): RecordedCall[] {
    return this.calls.filter((c) => c.model === model);
  }
}

/**
 * Create a mock LLM in canned mode (for unit tests).
 */
export function createTestLlm(): MockLlm {
  return new MockLlm({ mode: 'canned', recordCalls: true });
}

/**
 * Create a mock LLM in live mode (for integration tests).
 * Requires ANTHROPIC_API_KEY environment variable.
 */
export function createLiveLlm(): MockLlm {
  return new MockLlm({ mode: 'live', recordCalls: true });
}
