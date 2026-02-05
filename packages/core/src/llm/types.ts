/**
 * LLM module types
 */

/**
 * Configuration for LLM client
 */
export interface LlmConfig {
  apiKey: string;
  model: 'claude-3-5-haiku-20241022' | 'claude-3-5-sonnet-20241022';
  maxTokens?: number;
  temperature?: number;
}

/**
 * Response from LLM
 */
export interface LlmResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  usage: TokenUsage;
}

/**
 * Token usage for cost tracking
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
}

/**
 * Tool definition for Claude function calling
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Budget status
 */
export interface BudgetState {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: 0 | 1 | 2 | 3;
}
