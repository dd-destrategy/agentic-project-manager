/**
 * Triage Classify Lambda
 *
 * Second stage of triage: Classify signal importance and recommend actions.
 * Uses Claude Haiku for fast, cost-effective classification.
 * This Lambda has NO access to integration credentials (IAM isolation).
 *
 * Reference: solution-design/06-prompt-library.md Section 2.2
 */

import { createHaikuClient } from '@agentic-pm/core/llm';
import { classifySignalBatch } from '@agentic-pm/core/triage';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import type { Context } from 'aws-lambda';

import { logger, getEnv } from '../shared/context.js';
import type { TriageSanitiseOutput, TriageClassifyOutput } from '../shared/types.js';

// Lazy-loaded secrets client
let secretsClient: SecretsManagerClient | null = null;
let cachedApiKey: string | null = null;

/**
 * Get the LLM API key from Secrets Manager (cached)
 */
async function getLlmApiKey(): Promise<string> {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({});
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: '/agentic-pm/llm/api-key',
      })
    );

    if (!response.SecretString) {
      throw new Error('LLM API key secret is empty');
    }

    cachedApiKey = response.SecretString;
    return cachedApiKey;
  } catch (error) {
    logger.error('Failed to retrieve LLM API key', error as Error);
    throw error;
  }
}

export async function handler(
  event: TriageSanitiseOutput,
  context: Context
): Promise<TriageClassifyOutput> {
  logger.setContext(context);
  const env = getEnv();

  logger.info('Triage classification started', {
    signalCount: event.signals.length,
    environment: env.ENVIRONMENT,
  });

  // Handle empty input
  if (event.signals.length === 0) {
    logger.info('No signals to classify');
    return {
      signals: [],
      needsComplexReasoning: false,
    };
  }

  let useHeuristics = false;
  let apiKey: string | null = null;

  // Try to get LLM API key
  try {
    apiKey = await getLlmApiKey();
  } catch (error) {
    // Fall back to heuristics if we can't get the API key
    logger.warn('Using heuristic classification (LLM unavailable)', {
      error: (error as Error).message,
    });
    useHeuristics = true;
  }

  // Create Claude client if API key is available
  const client = apiKey ? createHaikuClient(apiKey) : undefined;

  // Classify signals in batch (efficient single LLM call)
  const result = await classifySignalBatch(event.signals, {
    client,
    useHeuristics,
  });

  // Log classification statistics
  const importanceCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const signal of result.signals) {
    const imp = signal.classification.importance;
    if (imp in importanceCounts) {
      importanceCounts[imp as keyof typeof importanceCounts]++;
    }
  }

  logger.info('Triage classification completed', {
    classifiedCount: result.signals.length,
    importanceCounts,
    needsComplexReasoning: result.needsComplexReasoning,
    usedLlm: !useHeuristics && !!client,
    tokenUsage: result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.usage.costUsd,
        }
      : undefined,
    durationMs: result.durationMs,
  });

  // Log critical signals for immediate attention
  const criticalSignals = result.signals.filter(
    (s) => s.classification.importance === 'critical'
  );
  if (criticalSignals.length > 0) {
    logger.warn('Critical signals detected', {
      count: criticalSignals.length,
      signalIds: criticalSignals.map((s) => s.id),
    });
  }

  return {
    signals: result.signals,
    needsComplexReasoning: result.needsComplexReasoning,
  };
}
