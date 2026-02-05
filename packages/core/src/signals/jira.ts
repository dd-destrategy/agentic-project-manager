/**
 * Jira signal normalisation
 *
 * Converts Jira webhook payloads and API responses to NormalisedSignal objects.
 */

import { ulid } from 'ulid';
import type { NormalisedSignal, RawSignal, SignalType } from '../types/index.js';

/**
 * Normalise a raw Jira signal into a NormalisedSignal
 */
export function normaliseJiraSignal(
  raw: RawSignal,
  projectId: string
): NormalisedSignal {
  const payload = raw.rawPayload as Record<string, unknown>;

  // Determine signal type from Jira event
  const signalType = mapJiraEventToSignalType(payload);

  // Extract summary from Jira payload
  const summary = extractJiraSummary(payload, signalType);

  return {
    id: ulid(),
    source: 'jira',
    timestamp: raw.timestamp,
    type: signalType,
    summary,
    raw: payload,
    projectId,
    metadata: extractJiraMetadata(payload),
  };
}

/**
 * Map Jira event types to our signal types
 */
function mapJiraEventToSignalType(
  payload: Record<string, unknown>
): SignalType {
  const webhookEvent = payload.webhookEvent as string | undefined;
  const changelogItems = (payload.changelog as { items?: unknown[] })?.items;

  if (!webhookEvent) {
    return 'unknown';
  }

  // Issue events
  if (webhookEvent === 'jira:issue_created') {
    return 'ticket_created';
  }

  if (webhookEvent === 'jira:issue_updated') {
    // Check changelog for specific changes
    if (Array.isArray(changelogItems)) {
      const hasStatusChange = changelogItems.some(
        (item: unknown) => (item as { field?: string })?.field === 'status'
      );
      if (hasStatusChange) {
        return 'ticket_status_changed';
      }

      const hasAssigneeChange = changelogItems.some(
        (item: unknown) => (item as { field?: string })?.field === 'assignee'
      );
      if (hasAssigneeChange) {
        return 'ticket_assigned';
      }
    }
    return 'ticket_updated';
  }

  if (webhookEvent === 'comment_created' || webhookEvent === 'comment_updated') {
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
 * Extract a human-readable summary from Jira payload
 */
function extractJiraSummary(
  payload: Record<string, unknown>,
  signalType: SignalType
): string {
  const issue = payload.issue as { key?: string; fields?: { summary?: string } } | undefined;
  const issueKey = issue?.key ?? 'Unknown';
  const issueSummary = issue?.fields?.summary ?? '';

  switch (signalType) {
    case 'ticket_created':
      return `New ticket created: ${issueKey} - ${issueSummary}`;
    case 'ticket_status_changed': {
      const changelog = payload.changelog as { items?: Array<{ fromString?: string; toString?: string }> };
      const statusChange = changelog?.items?.find(
        (item: unknown) => (item as { field?: string })?.field === 'status'
      );
      const from = statusChange?.fromString ?? '?';
      const to = statusChange?.toString ?? '?';
      return `${issueKey} status changed: ${from} → ${to}`;
    }
    case 'ticket_assigned': {
      const changelog = payload.changelog as { items?: Array<{ toString?: string }> };
      const assigneeChange = changelog?.items?.find(
        (item: unknown) => (item as { field?: string })?.field === 'assignee'
      );
      const assignee = assigneeChange?.toString ?? 'Unassigned';
      return `${issueKey} assigned to ${assignee}`;
    }
    case 'ticket_commented':
      return `New comment on ${issueKey}`;
    case 'ticket_updated':
      return `${issueKey} updated`;
    case 'sprint_started': {
      const sprint = payload.sprint as { name?: string } | undefined;
      return `Sprint started: ${sprint?.name ?? 'Unknown sprint'}`;
    }
    case 'sprint_closed': {
      const sprint = payload.sprint as { name?: string } | undefined;
      return `Sprint closed: ${sprint?.name ?? 'Unknown sprint'}`;
    }
    default:
      return `Jira event: ${issueKey}`;
  }
}

/**
 * Extract metadata from Jira payload
 */
function extractJiraMetadata(payload: Record<string, unknown>) {
  const issue = payload.issue as {
    fields?: {
      priority?: { name?: string };
      labels?: string[];
    };
  } | undefined;

  const priority = issue?.fields?.priority?.name?.toLowerCase();
  const tags = issue?.fields?.labels;

  return {
    priority: mapJiraPriority(priority),
    tags,
  };
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
