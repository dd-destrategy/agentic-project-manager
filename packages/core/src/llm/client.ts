/**
 * Claude API client
 *
 * Wrapper around the Anthropic SDK with tool-use support.
 */

import type { LlmConfig, LlmResponse, TokenUsage, ToolDefinition } from './types.js';

/** Pricing per million tokens (as of Feb 2026) */
const PRICING = {
  'claude-3-5-haiku-20241022': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00,
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
} as const;

/**
 * Claude API client with tool-use support
 */
export class ClaudeClient {
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  /**
   * Call Claude with tool-use
   *
   * @param systemPrompt - System prompt for the conversation
   * @param userMessage - User message
   * @param tools - Available tools
   * @returns LLM response with parsed tool output
   *
   * TODO: Implement with Anthropic SDK in Sprint 2
   */
  async callWithTools<T>(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[]
  ): Promise<LlmResponse<T>> {
    // Stub implementation - returns mock response
    // Real implementation will use @anthropic-ai/sdk

    const mockUsage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: this.calculateCost(1000, 500),
    };

    return {
      success: true,
      data: undefined,
      usage: mockUsage,
    };
  }

  /**
   * Calculate cost for token usage
   */
  private calculateCost(
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens = 0,
    cacheWriteTokens = 0
  ): number {
    const prices = PRICING[this.config.model];

    const inputCost = (inputTokens / 1_000_000) * prices.input;
    const outputCost = (outputTokens / 1_000_000) * prices.output;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * prices.cacheRead;
    const cacheWriteCost = (cacheWriteTokens / 1_000_000) * prices.cacheWrite;

    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }
}
