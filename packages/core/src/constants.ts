/**
 * Application constants
 */

export const SCHEMA_VERSION = '1.0.0';

export const TABLE_NAME = process.env.TABLE_NAME ?? 'AgenticPM';

/** Default polling interval in minutes */
export const DEFAULT_POLLING_INTERVAL_MINUTES = 15;

/** Default hold queue duration in minutes */
export const DEFAULT_HOLD_QUEUE_MINUTES = 30;

/** Daily LLM budget ceiling in USD */
export const DAILY_LLM_BUDGET_USD = 0.23;

/** Monthly LLM budget ceiling in USD */
export const MONTHLY_LLM_BUDGET_USD = 8.0;

/** TTL durations in seconds */
export const TTL = {
  /** Events expire after 30 days */
  EVENTS_DAYS: 30,
  /** Actions expire after 90 days */
  ACTIONS_DAYS: 90,
  /** Checkpoints never expire (no TTL) */
  CHECKPOINTS: null,
} as const;

/** DynamoDB key prefixes */
export const KEY_PREFIX = {
  PROJECT: 'PROJECT#',
  ARTEFACT: 'ARTEFACT#',
  EVENT: 'EVENT#',
  ESCALATION: 'ESCALATION#',
  ACTION: 'ACTION#',
  CHECKPOINT: 'CHECKPOINT#',
  INTEGRATION: 'INTEGRATION#',
  AGENT: 'AGENT',
  GLOBAL: 'GLOBAL',
  STATUS: 'STATUS#',
  CONFIG: 'CONFIG#',
  INGEST: 'INGEST#',
} as const;

/** GSI1 key prefixes */
export const GSI1_PREFIX = {
  STATUS_ACTIVE: 'STATUS#active',
  ESCALATION_PENDING: 'ESCALATION#pending',
  ESCALATION_DECIDED: 'ESCALATION#decided',
  ACTIONS_HELD: 'ACTIONS#held',
  EVENT_DATE: 'EVENT#', // Followed by date
  INGEST_ACTIVE: 'INGEST#active',
  INGEST_ARCHIVED: 'INGEST#archived',
} as const;

/** Autonomy level numeric values for comparison */
export const AUTONOMY_LEVEL_VALUE = {
  monitoring: 1,
  artefact: 2,
  tactical: 3,
} as const;

/** Default dry-run mode setting */
export const DEFAULT_DRY_RUN = false;

/** Default autonomy level for new projects */
export const DEFAULT_AUTONOMY_LEVEL = 'monitoring' as const;
