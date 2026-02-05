/**
 * Claude API client
 *
 * Wrapper around the Anthropic SDK with tool-use support.
 * All LLM outputs are via tool-use (function calling), never raw JSON.parse.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmConfig,
  LlmResponse,
  TokenUsage,
  ToolDefinition,
  ModelId,
} from './types.js';

/** Pricing per million tokens (as of Feb 2026) */
export const PRICING: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-3-5-haiku-20241022': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00,
  },
  'claude-sonnet-4-5-20250514': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
} as const;

/** Model aliases for convenience */
export const MODEL_ALIASES = {
  haiku: 'claude-3-5-haiku-20241022' as const,
  sonnet: 'claude-sonnet-4-5-20250514' as const,
};

/**
 * Claude API client with tool-use support
 */
export class ClaudeClient {
  private client: Anthropic;
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  /**
   * Call Claude with tool-use (function calling)
   *
   * @param systemPrompt - System prompt for the conversation
   * @param userMessage - User message
   * @param tools - Available tools with JSON schemas
   * @param options - Optional parameters (forceTool to require a specific tool)
   * @returns LLM response with parsed tool output
   */
  async callWithTools<T>(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
    options?: {
      forceTool?: string;
      maxTokens?: number;
    }
  ): Promise<LlmResponse<T>> {
    const startTime = Date.now();

    try {
      // Convert tool definitions to Anthropic format
      const anthropicTools: Anthropic.Tool[] = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
      }));

      // Build tool_choice - force specific tool if requested
      const toolChoice: Anthropic.ToolChoice = options?.forceTool
        ? { type: 'tool', name: options.forceTool }
        : { type: 'auto' };

      // Make API call
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
        tools: anthropicTools,
        tool_choice: toolChoice,
      });

      // Calculate token usage
      const usage = this.calculateUsage(response.usage);
      const durationMs = Date.now() - startTime;

      // Extract tool use from response
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUseBlock) {
        // Model didn't use a tool - this shouldn't happen with tool_choice set
        const textContent = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        return {
          success: false,
          error: `Model did not use a tool. Response: ${textContent.slice(0, 200)}`,
          usage,
          durationMs,
        };
      }

      // Return successful response with parsed tool input
      return {
        success: true,
        data: toolUseBlock.input as T,
        toolName: toolUseBlock.name,
        usage,
        durationMs,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle specific Anthropic errors
      if (error instanceof Anthropic.APIError) {
        return {
          success: false,
          error: `Claude API error: ${error.message} (status: ${error.status})`,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          durationMs,
        };
      }

      // Handle rate limiting
      if (error instanceof Anthropic.RateLimitError) {
        return {
          success: false,
          error: 'Rate limited by Claude API. Will retry.',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          durationMs,
          retryable: true,
        };
      }

      // Handle other errors
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        durationMs,
      };
    }
  }

  /**
   * Simple text completion without tools (for internal use only)
   * Prefer callWithTools for all structured outputs.
   */
  async complete(
    systemPrompt: string,
    userMessage: string,
    maxTokens?: number
  ): Promise<LlmResponse<string>> {
    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: maxTokens ?? this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      const usage = this.calculateUsage(response.usage);
      const durationMs = Date.now() - startTime;

      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return {
        success: true,
        data: textContent,
        usage,
        durationMs,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        durationMs,
      };
    }
  }

  /**
   * Calculate token usage and cost from API response
   */
  private calculateUsage(usage: Anthropic.Usage): TokenUsage {
    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    const cacheReadTokens = (usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
    const cacheWriteTokens = (usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0;

    const costUsd = this.calculateCost(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
      cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
      costUsd,
    };
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(
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

  /**
   * Estimate token count for a string (rough approximation)
   * Use for budget checking before making API calls.
   * Actual usage should come from API response.
   */
  static estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    // This is conservative to avoid budget overruns
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Get model pricing info
   */
  getModelPricing(): { input: number; output: number; cacheRead: number; cacheWrite: number } {
    return PRICING[this.config.model];
  }

  /**
   * Get current model ID
   */
  getModel(): ModelId {
    return this.config.model;
  }

  /**
   * Create a new client with a different model
   */
  withModel(model: ModelId): ClaudeClient {
    return new ClaudeClient({
      ...this.config,
      model,
    });
  }
}

/**
 * Create a Haiku client for triage operations (cheap, fast)
 */
export function createHaikuClient(apiKey: string): ClaudeClient {
  return new ClaudeClient({
    apiKey,
    model: MODEL_ALIASES.haiku,
    maxTokens: 4096,
    temperature: 0,
  });
}

/**
 * Create a Sonnet client for complex reasoning (higher quality)
 */
export function createSonnetClient(apiKey: string): ClaudeClient {
  return new ClaudeClient({
    apiKey,
    model: MODEL_ALIASES.sonnet,
    maxTokens: 8192,
    temperature: 0,
  });
}
