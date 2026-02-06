/**
 * Custom CloudWatch metrics for the agent runtime
 *
 * Emits operational metrics to CloudWatch under the 'AgenticPM' namespace.
 * Metrics are buffered and flushed in a single PutMetricData call to
 * minimise API requests and cost.
 *
 * Tracked metrics:
 * - AgentCycleCount  — number of agent cycles executed
 * - LLMCostDaily     — estimated daily LLM spend (USD)
 * - EscalationCount  — number of escalations created
 * - TriggerCount     — number of triggers fired
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';

/** The CloudWatch namespace for all Agentic PM metrics */
const METRIC_NAMESPACE = 'AgenticPM';

/** Metric names as a const union for type safety */
export type MetricName =
  | 'AgentCycleCount'
  | 'LLMCostDaily'
  | 'EscalationCount'
  | 'TriggerCount';

/** Mapping of metric names to their CloudWatch units */
const METRIC_UNITS: Record<MetricName, StandardUnit> = {
  AgentCycleCount: StandardUnit.Count,
  LLMCostDaily: StandardUnit.None, // USD amount, no standard unit
  EscalationCount: StandardUnit.Count,
  TriggerCount: StandardUnit.Count,
};

/**
 * CloudWatch metrics emitter for the Agentic PM agent runtime.
 *
 * Buffers metric data points and flushes them in a single API call.
 * This reduces CloudWatch API costs and keeps Lambda execution time low.
 */
export class MetricsEmitter {
  private buffer: MetricDatum[] = [];
  private client: CloudWatchClient;
  private environment: string;

  constructor(options?: { client?: CloudWatchClient; environment?: string }) {
    this.client = options?.client ?? new CloudWatchClient({});
    this.environment = options?.environment ?? process.env.ENVIRONMENT ?? 'dev';
  }

  /**
   * Record a metric data point into the buffer.
   *
   * @param name - The metric name
   * @param value - The metric value
   */
  record(name: MetricName, value: number): void {
    this.buffer.push({
      MetricName: name,
      Value: value,
      Unit: METRIC_UNITS[name],
      Timestamp: new Date(),
      Dimensions: [
        {
          Name: 'Environment',
          Value: this.environment,
        },
      ],
    });
  }

  /**
   * Increment a count metric by 1.
   */
  increment(name: MetricName): void {
    this.record(name, 1);
  }

  /**
   * Flush all buffered metrics to CloudWatch.
   *
   * CloudWatch PutMetricData supports up to 1000 metric data points
   * per call. We batch in groups of 1000 if the buffer is large.
   *
   * Errors are logged but not re-thrown — metric emission should
   * never cause a Lambda invocation to fail.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const batches: MetricDatum[][] = [];
    const maxBatchSize = 1000;

    for (let i = 0; i < this.buffer.length; i += maxBatchSize) {
      batches.push(this.buffer.slice(i, i + maxBatchSize));
    }

    // Clear the buffer before sending to avoid double-flush
    this.buffer = [];

    for (const batch of batches) {
      try {
        await this.client.send(
          new PutMetricDataCommand({
            Namespace: METRIC_NAMESPACE,
            MetricData: batch,
          })
        );
      } catch (error) {
        // Log but do not throw — metrics should not break the agent cycle
        console.error(
          JSON.stringify({
            level: 'ERROR',
            message: 'Failed to flush CloudWatch metrics',
            error: error instanceof Error ? error.message : String(error),
            metricCount: batch.length,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }
  }

  /**
   * Get the number of buffered (unflushed) metric data points.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }
}

/** Singleton instance shared across Lambda handler invocations */
export const metrics = new MetricsEmitter();
