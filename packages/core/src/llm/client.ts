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
  RetryConfig,
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

/** Default retry configuration */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs * 0.5;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Claude API client with tool-use support
 */
export class ClaudeClient {
  private client: Anthropic;
  private config: LlmConfig;
  private retryConfig: RetryConfig;

  constructor(config: LlmConfig, retryConfig?: Partial<RetryConfig>) {
    this.config = config;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
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
      skipRetry?: boolean;
    }
  ): Promise<LlmResponse<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
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
        totalUsage = this.mergeUsage(totalUsage, usage);
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
            usage: totalUsage,
            durationMs,
          };
        }

        // Return successful response with parsed tool input
        return {
          success: true,
          data: toolUseBlock.input as T,
          toolName: toolUseBlock.name,
          usage: totalUsage,
          durationMs,
          stopReason: response.stop_reason,
          retriesUsed: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        const shouldRetry = isRetryable && !options?.skipRetry && attempt < this.retryConfig.maxRetries;

        if (shouldRetry) {
          const delay = this.getRetryDelay(error, attempt);
          await sleep(delay);
          continue;
        }

        // Not retryable or out of retries
        const durationMs = Date.now() - startTime;
        return this.handleError(error, totalUsage, durationMs, attempt);
      }
    }

    // Should not reach here, but TypeScript needs it
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: lastError?.message ?? 'Unknown error after retries',
      usage: totalUsage,
      durationMs,
      retriesUsed: this.retryConfig.maxRetries,
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Anthropic.RateLimitError) {
      return true;
    }
    if (error instanceof Anthropic.APIError) {
      return this.retryConfig.retryableStatusCodes.includes(error.status);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return true;
    }
    return false;
  }

  /**
   * Get retry delay, respecting Retry-After header if present
   */
  private getRetryDelay(error: unknown, attempt: number): number {
    // Check for Retry-After header in rate limit errors
    if (error instanceof Anthropic.RateLimitError) {
      const retryAfter = (error as { headers?: { 'retry-after'?: string } }).headers?.['retry-after'];
      if (retryAfter) {
        const retryAfterMs = parseInt(retryAfter, 10) * 1000;
        if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
          return Math.min(retryAfterMs, this.retryConfig.maxDelayMs);
        }
      }
    }

    // Fall back to exponential backoff
    return calculateBackoffDelay(
      attempt,
      this.retryConfig.baseDelayMs,
      this.retryConfig.maxDelayMs
    );
  }

  /**
   * Handle error and return appropriate LlmResponse
   */
  private handleError(
    error: unknown,
    usage: TokenUsage,
    durationMs: number,
    retriesUsed: number
  ): LlmResponse<never> {
    if (error instanceof Anthropic.RateLimitError) {
      return {
        success: false,
        error: 'Rate limited by Claude API after all retries exhausted.',
        usage,
        durationMs,
        retryable: true,
        retriesUsed,
      };
    }

    if (error instanceof Anthropic.AuthenticationError) {
      return {
        success: false,
        error: 'Claude API authentication failed. Check API key.',
        usage,
        durationMs,
        retryable: false,
        retriesUsed,
      };
    }

    if (error instanceof Anthropic.BadRequestError) {
      return {
        success: false,
        error: `Claude API bad request: ${error.message}`,
        usage,
        durationMs,
        retryable: false,
        retriesUsed,
      };
    }

    if (error instanceof Anthropic.APIError) {
      return {
        success: false,
        error: `Claude API error: ${error.message} (status: ${error.status})`,
        usage,
        durationMs,
        retryable: this.retryConfig.retryableStatusCodes.includes(error.status),
        retriesUsed,
      };
    }

    if (error instanceof Anthropic.APIConnectionError) {
      return {
        success: false,
        error: `Claude API connection error: ${error.message}`,
        usage,
        durationMs,
        retryable: true,
        retriesUsed,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      usage,
      durationMs,
      retriesUsed,
    };
  }

  /**
   * Merge token usage from multiple attempts
   */
  private mergeUsage(existing: TokenUsage, newUsage: TokenUsage): TokenUsage {
    return {
      inputTokens: existing.inputTokens + newUsage.inputTokens,
      outputTokens: existing.outputTokens + newUsage.outputTokens,
      cacheReadTokens: (existing.cacheReadTokens ?? 0) + (newUsage.cacheReadTokens ?? 0) || undefined,
      cacheWriteTokens: (existing.cacheWriteTokens ?? 0) + (newUsage.cacheWriteTokens ?? 0) || undefined,
      costUsd: existing.costUsd + newUsage.costUsd,
    };
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
