/**
 * Integrations module
 *
 * Clients for external services: Jira, Outlook, SES.
 */

export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerState,
  type CircuitBreakerOptions,
} from './circuit-breaker.js';

export {
  JiraClient,
  RateLimiter,
  formatJiraTimestamp,
  createJiraClient,
  createJiraClientForProject,
  type JiraConfig,
  type JiraIssue,
  type JiraChangelogHistory,
  type JiraChangelogItem,
  type JiraComment,
  type JiraSprint,
  type JiraProject,
  type JiraBoard,
  type JiraWebhookEvent,
} from './jira.js';
// export { OutlookClient } from './outlook.js'; // Phase 3
export { SESClient } from './ses.js';
export type { SignalSource, IntegrationHealthCheck } from './types.js';
