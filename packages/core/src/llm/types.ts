/**
 * LLM module types
 */

/**
 * Supported Claude model IDs
 */
export type ModelId = 'claude-3-5-haiku-20241022' | 'claude-sonnet-4-5-20250514';

/**
 * Configuration for LLM client
 */
export interface LlmConfig {
  apiKey: string;
  model: ModelId;
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
  toolName?: string;
  durationMs?: number;
  stopReason?: string;
  retryable?: boolean;
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
  input_schema: JsonSchema;
}

/**
 * JSON Schema type for tool input schemas
 */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * JSON Schema property types
 */
export type JsonSchemaProperty =
  | JsonSchemaString
  | JsonSchemaNumber
  | JsonSchemaBoolean
  | JsonSchemaArray
  | JsonSchemaObject
  | JsonSchemaEnum;

export interface JsonSchemaString {
  type: 'string';
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'date-time' | 'date' | 'email' | 'uri';
}

export interface JsonSchemaNumber {
  type: 'number' | 'integer';
  description?: string;
  minimum?: number;
  maximum?: number;
}

export interface JsonSchemaBoolean {
  type: 'boolean';
  description?: string;
}

export interface JsonSchemaArray {
  type: 'array';
  description?: string;
  items: JsonSchemaProperty | JsonSchema;
  minItems?: number;
  maxItems?: number;
}

export interface JsonSchemaObject {
  type: 'object';
  description?: string;
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaEnum {
  type: 'string';
  description?: string;
  enum: string[];
}

/**
 * Budget status
 */
export interface BudgetState {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
  degradationTier: DegradationTier;
  currentDate: string;
  monthStartDate: string;
}

/**
 * Degradation tier levels
 *
 * Tier 0: Normal operation (70/30 Haiku/Sonnet)
 * Tier 1: Budget pressure - reduce Sonnet usage (85/15)
 * Tier 2: High pressure - Haiku only
 * Tier 3: Hard ceiling - monitoring only, no LLM calls
 */
export type DegradationTier = 0 | 1 | 2 | 3;

/**
 * Degradation tier configuration
 */
export interface DegradationConfig {
  tier: DegradationTier;
  name: string;
  description: string;
  dailyThresholdUsd: number;
  haikuPercent: number;
  sonnetPercent: number;
  allowLlmCalls: boolean;
  pollingIntervalMinutes: number;
}

/**
 * Budget record stored in DynamoDB
 */
export interface BudgetRecord {
  PK: string;
  SK: string;
  dailySpendUsd: number;
  monthlySpendUsd: number;
  currentDate: string;
  monthStartDate: string;
  lastUpdated: string;
  usageHistory: UsageEntry[];
}

/**
 * Individual usage entry for tracking
 */
export interface UsageEntry {
  timestamp: string;
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  operation: string;
}

/**
 * Signal classification result from Claude
 */
export interface ClassificationResult {
  importance: 'critical' | 'high' | 'medium' | 'low' | 'noise';
  categories: string[];
  recommendedAction: 'update_artefact' | 'create_escalation' | 'send_notification' | 'hold_for_review' | 'ignore';
  requiresComplexReasoning: boolean;
  rationale: string;
}

/**
 * Batch classification result
 */
export interface BatchClassificationResult {
  classifications: Array<{
    signalId: string;
    classification: ClassificationResult;
  }>;
}
