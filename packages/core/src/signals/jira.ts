/**
 * Jira signal normalisation
 *
 * Converts Jira webhook payloads and API responses to NormalisedSignal objects.
 * Handles both:
 * - Webhook events (jira:issue_created, jira:issue_updated, etc.)
 * - API responses from fetchDelta (JiraIssue objects with changelog)
 */

import { ulid } from 'ulid';
import type { NormalisedSignal, RawSignal, SignalType } from '../types/index.js';
import type {
  JiraIssue,
  JiraChangelogHistory,
  JiraChangelogItem,
  JiraWebhookEvent,
} from '../integrations/jira.js';

/**
 * Normalise a raw Jira signal into one or more NormalisedSignal objects
 *
 * For API responses, a single issue update may generate multiple signals
 * if there were multiple significant changes in the changelog.
 */
export function normaliseJiraSignal(
  raw: RawSignal,
  projectId: string
): NormalisedSignal {
  const payload = raw.rawPayload as Record<string, unknown>;

  // Detect if this is a webhook event or an API response
  const isWebhook = 'webhookEvent' in payload;

  if (isWebhook) {
    return normaliseWebhookEvent(payload as JiraWebhookEvent, projectId, raw.timestamp);
  } else {
    return normaliseApiResponse(payload as JiraIssue, projectId, raw.timestamp);
  }
}

/**
 * Normalise multiple signals from a single Jira issue
 *
 * This is useful when an issue has multiple changelog entries
 * and we want to create separate signals for each significant change.
 */
export function normaliseJiraSignalExpanded(
  raw: RawSignal,
  projectId: string
): NormalisedSignal[] {
  const payload = raw.rawPayload as Record<string, unknown>;

  // Detect if this is a webhook event or an API response
  const isWebhook = 'webhookEvent' in payload;

  if (isWebhook) {
    return [normaliseWebhookEvent(payload as JiraWebhookEvent, projectId, raw.timestamp)];
  } else {
    return normaliseApiResponseExpanded(payload as JiraIssue, projectId, raw.timestamp);
  }
}

/**
 * Normalise a Jira webhook event
 */
function normaliseWebhookEvent(
  event: JiraWebhookEvent,
  projectId: string,
  timestamp: string
): NormalisedSignal {
  const signalType = mapWebhookEventToSignalType(event);
  const summary = extractWebhookSummary(event, signalType);

  return {
    id: ulid(),
    source: 'jira',
    timestamp,
    type: signalType,
    summary,
    raw: event as unknown as Record<string, unknown>,
    projectId,
    metadata: extractWebhookMetadata(event),
  };
}

/**
 * Normalise a Jira API response (single signal)
 *
 * Determines the most significant change from the changelog.
 */
function normaliseApiResponse(
  issue: JiraIssue,
  projectId: string,
  timestamp: string
): NormalisedSignal {
  const signalType = determineSignalTypeFromIssue(issue);
  const summary = extractIssueSummary(issue, signalType);

  return {
    id: ulid(),
    source: 'jira',
    timestamp,
    type: signalType,
    summary,
    raw: issue as unknown as Record<string, unknown>,
    projectId,
    metadata: extractIssueMetadata(issue),
  };
}

/**
 * Normalise a Jira API response into multiple signals
 *
 * Creates separate signals for each significant changelog entry.
 */
function normaliseApiResponseExpanded(
  issue: JiraIssue,
  projectId: string,
  timestamp: string
): NormalisedSignal[] {
  const signals: NormalisedSignal[] = [];
  const changelog = issue.changelog?.histories ?? [];

  // If no changelog, this is likely a new issue or we don't have changelog data
  if (changelog.length === 0) {
    // Check if this is a newly created issue (created == updated within 1 second)
    const created = new Date(issue.fields.created).getTime();
    const updated = new Date(issue.fields.updated).getTime();
    const isNew = Math.abs(updated - created) < 1000;

    signals.push({
      id: ulid(),
      source: 'jira',
      timestamp,
      type: isNew ? 'ticket_created' : 'ticket_updated',
      summary: isNew
        ? `New ticket created: ${issue.key} - ${issue.fields.summary}`
        : `${issue.key} updated: ${issue.fields.summary}`,
      raw: issue as unknown as Record<string, unknown>,
      projectId,
      metadata: extractIssueMetadata(issue),
    });

    return signals;
  }

  // Process each changelog entry
  for (const history of changelog) {
    const signalType = determineSignalTypeFromChangelog(history.items);
    const summary = extractChangelogSummary(issue, history);

    signals.push({
      id: ulid(),
      source: 'jira',
      timestamp: history.created,
      type: signalType,
      summary,
      raw: {
        issue,
        changelogEntry: history,
      } as unknown as Record<string, unknown>,
      projectId,
      metadata: extractIssueMetadata(issue),
    });
  }

  // If we generated multiple signals, ensure they're ordered by timestamp
  signals.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return signals;
}

/**
 * Map Jira webhook event types to our signal types
 */
function mapWebhookEventToSignalType(event: JiraWebhookEvent): SignalType {
  const webhookEvent = event.webhookEvent;
  const changelogItems = event.changelog?.items;

  // Issue events
  if (webhookEvent === 'jira:issue_created') {
    return 'ticket_created';
  }

  if (webhookEvent === 'jira:issue_updated') {
    if (Array.isArray(changelogItems)) {
      const hasStatusChange = changelogItems.some(
        (item) => item.field === 'status'
      );
      if (hasStatusChange) {
        return 'ticket_status_changed';
      }

      const hasAssigneeChange = changelogItems.some(
        (item) => item.field === 'assignee'
      );
      if (hasAssigneeChange) {
        return 'ticket_assigned';
      }
    }
    return 'ticket_updated';
  }

  if (webhookEvent === 'jira:issue_deleted') {
    return 'ticket_updated'; // We track deletions as updates
  }

  // Comment events
  if (
    webhookEvent === 'comment_created' ||
    webhookEvent === 'comment_updated'
  ) {
    return 'ticket_commented';
  }

  // Sprint events
  if (webhookEvent === 'sprint_started') {
    return 'sprint_started';
  }

  if (webhookEvent === 'sprint_closed') {
    return 'sprint_closed';
  }

  return 'unknown';
}

/**
 * Determine signal type from an issue's changelog
 */
function determineSignalTypeFromIssue(issue: JiraIssue): SignalType {
  const changelog = issue.changelog?.histories ?? [];

  // Check if this is a newly created issue
  const created = new Date(issue.fields.created).getTime();
  const updated = new Date(issue.fields.updated).getTime();
  if (Math.abs(updated - created) < 1000) {
    return 'ticket_created';
  }

  // Check the most recent changelog entry
  if (changelog.length > 0) {
    const latestChange = changelog[changelog.length - 1];
    return determineSignalTypeFromChangelog(latestChange.items);
  }

  return 'ticket_updated';
}

/**
 * Determine signal type from changelog items
 */
function determineSignalTypeFromChangelog(items: JiraChangelogItem[]): SignalType {
  // Priority order: status > assignee > other
  const hasStatusChange = items.some((item) => item.field === 'status');
  if (hasStatusChange) {
    return 'ticket_status_changed';
  }

  const hasAssigneeChange = items.some((item) => item.field === 'assignee');
  if (hasAssigneeChange) {
    return 'ticket_assigned';
  }

  // Check for sprint changes
  const hasSprintChange = items.some((item) => item.field === 'Sprint');
  if (hasSprintChange) {
    return 'sprint_scope_changed';
  }

  return 'ticket_updated';
}

/**
 * Extract a human-readable summary from a webhook event
 */
function extractWebhookSummary(
  event: JiraWebhookEvent,
  signalType: SignalType
): string {
  const issue = event.issue;
  const issueKey = issue?.key ?? 'Unknown';
  const issueSummary = issue?.fields?.summary ?? '';

  switch (signalType) {
    case 'ticket_created':
      return `New ticket created: ${issueKey} - ${issueSummary}`;

    case 'ticket_status_changed': {
      const statusChange = event.changelog?.items?.find(
        (item) => item.field === 'status'
      );
      const from = statusChange?.fromString ?? '?';
      const to = statusChange?.toString ?? '?';
      return `${issueKey} status changed: ${from} -> ${to}`;
    }

    case 'ticket_assigned': {
      const assigneeChange = event.changelog?.items?.find(
        (item) => item.field === 'assignee'
      );
      const assignee = assigneeChange?.toString ?? 'Unassigned';
      return `${issueKey} assigned to ${assignee}`;
    }

    case 'ticket_commented':
      return `New comment on ${issueKey}`;

    case 'ticket_updated':
      return `${issueKey} updated`;

    case 'sprint_started':
      return `Sprint started: ${event.sprint?.name ?? 'Unknown sprint'}`;

    case 'sprint_closed':
      return `Sprint closed: ${event.sprint?.name ?? 'Unknown sprint'}`;

    default:
      return `Jira event: ${issueKey}`;
  }
}

/**
 * Extract a human-readable summary from an issue
 */
function extractIssueSummary(issue: JiraIssue, signalType: SignalType): string {
  const issueKey = issue.key;
  const issueSummary = issue.fields.summary;

  switch (signalType) {
    case 'ticket_created':
      return `New ticket created: ${issueKey} - ${issueSummary}`;

    case 'ticket_status_changed': {
      const changelog = issue.changelog?.histories ?? [];
      const latestChange = changelog[changelog.length - 1];
      const statusChange = latestChange?.items?.find(
        (item) => item.field === 'status'
      );
      if (statusChange) {
        return `${issueKey} status changed: ${statusChange.fromString} -> ${statusChange.toString}`;
      }
      return `${issueKey} status changed`;
    }

    case 'ticket_assigned': {
      const assignee = issue.fields.assignee?.displayName ?? 'Unassigned';
      return `${issueKey} assigned to ${assignee}`;
    }

    case 'sprint_scope_changed':
      return `${issueKey} sprint assignment changed`;

    case 'ticket_updated':
    default:
      return `${issueKey} updated: ${issueSummary}`;
  }
}

/**
 * Extract a summary from a changelog entry
 */
function extractChangelogSummary(
  issue: JiraIssue,
  history: JiraChangelogHistory
): string {
  const issueKey = issue.key;
  const items = history.items;

  // Find the most significant change
  const statusChange = items.find((item) => item.field === 'status');
  if (statusChange) {
    return `${issueKey} status changed: ${statusChange.fromString} -> ${statusChange.toString}`;
  }

  const assigneeChange = items.find((item) => item.field === 'assignee');
  if (assigneeChange) {
    const assignee = assigneeChange.toString ?? 'Unassigned';
    return `${issueKey} assigned to ${assignee}`;
  }

  const sprintChange = items.find((item) => item.field === 'Sprint');
  if (sprintChange) {
    return `${issueKey} moved to sprint: ${sprintChange.toString ?? 'None'}`;
  }

  // Default to first change
  if (items.length > 0) {
    const firstItem = items[0];
    return `${issueKey} ${firstItem.field} changed`;
  }

  return `${issueKey} updated`;
}

/**
 * Extract metadata from a webhook event
 */
function extractWebhookMetadata(event: JiraWebhookEvent) {
  const issue = event.issue;
  const priority = issue?.fields?.priority?.name?.toLowerCase();
  const tags = issue?.fields?.labels;

  return {
    priority: mapJiraPriority(priority),
    tags,
    participants: extractParticipants(issue),
  };
}

/**
 * Extract metadata from an issue
 */
function extractIssueMetadata(issue: JiraIssue) {
  const priority = issue.fields?.priority?.name?.toLowerCase();
  const tags = issue.fields?.labels;

  return {
    priority: mapJiraPriority(priority),
    tags,
    participants: extractParticipants(issue),
    relatedTickets: [issue.key],
  };
}

/**
 * Extract participants from an issue
 */
function extractParticipants(issue?: JiraIssue): string[] {
  if (!issue) return [];

  const participants: string[] = [];

  if (issue.fields?.assignee?.displayName) {
    participants.push(issue.fields.assignee.displayName);
  }

  if (issue.fields?.reporter?.displayName) {
    participants.push(issue.fields.reporter.displayName);
  }

  // Deduplicate
  return [...new Set(participants)];
}

/**
 * Map Jira priority to our priority levels
 */
function mapJiraPriority(
  priority: string | undefined
): 'critical' | 'high' | 'medium' | 'low' | undefined {
  if (!priority) return undefined;

  const normalised = priority.toLowerCase();
  if (normalised.includes('critical') || normalised.includes('blocker')) {
    return 'critical';
  }
  if (normalised.includes('high') || normalised.includes('highest')) {
    return 'high';
  }
  if (normalised.includes('medium')) {
    return 'medium';
  }
  if (normalised.includes('low') || normalised.includes('lowest')) {
    return 'low';
  }
  return undefined;
}

/**
 * Check if a Jira signal represents a significant change
 *
 * Used to filter out noise (e.g., minor field updates)
 */
export function isSignificantJiraChange(signal: NormalisedSignal): boolean {
  const significantTypes: SignalType[] = [
    'ticket_created',
    'ticket_status_changed',
    'ticket_assigned',
    'ticket_commented',
    'sprint_started',
    'sprint_closed',
    'sprint_scope_changed',
  ];

  return significantTypes.includes(signal.type);
}

/**
 * Create a Jira signal normaliser for use with the signal processing pipeline
 */
export const jiraSignalNormaliser = {
  source: 'jira' as const,
  normalise: normaliseJiraSignal,
  normaliseExpanded: normaliseJiraSignalExpanded,
  isSignificant: isSignificantJiraChange,
};
