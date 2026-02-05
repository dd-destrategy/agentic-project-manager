/**
 * Integrations module
 *
 * Clients for external services: Jira, Outlook, SES.
 */

export { JiraClient } from './jira.js';
// export { OutlookClient } from './outlook.js'; // Phase 3
export { SESClient } from './ses.js';
export type { SignalSource, IntegrationHealthCheck } from './types.js';
