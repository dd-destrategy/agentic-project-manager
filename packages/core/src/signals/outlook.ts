/**
 * Outlook signal normalisation
 *
 * Converts Microsoft Graph API email responses to NormalisedSignal objects.
 * Handles various email event types:
 * - email_received - New email in inbox
 * - email_flagged - Email marked as flagged/important
 * - email_thread_updated - Reply in existing conversation
 */

import { ulid } from 'ulid';

import type { GraphMessage, EmailAddress } from '../integrations/outlook.js';
import type { NormalisedSignal, RawSignal, SignalType } from '../types/index.js';

/**
 * Normalise a raw Outlook signal into a NormalisedSignal object
 */
export function normaliseOutlookSignal(
  raw: RawSignal,
  projectId: string
): NormalisedSignal {
  const message = raw.rawPayload as GraphMessage;
  const signalType = determineSignalType(message);
  const summary = extractSummary(message, signalType);

  return {
    id: ulid(),
    source: 'outlook',
    timestamp: raw.timestamp,
    type: signalType,
    summary,
    raw: message as unknown as Record<string, unknown>,
    projectId,
    metadata: extractMetadata(message),
  };
}

/**
 * Normalise multiple signals from an Outlook message
 *
 * In most cases, a single email produces a single signal.
 * However, if an email has multiple significant attributes
 * (e.g., high importance AND flagged), we might want to
 * generate multiple signals.
 */
export function normaliseOutlookSignalExpanded(
  raw: RawSignal,
  projectId: string
): NormalisedSignal[] {
  const message = raw.rawPayload as GraphMessage;
  const signals: NormalisedSignal[] = [];

  // Primary signal based on email state
  const primarySignalType = determineSignalType(message);
  const primarySummary = extractSummary(message, primarySignalType);

  signals.push({
    id: ulid(),
    source: 'outlook',
    timestamp: raw.timestamp,
    type: primarySignalType,
    summary: primarySummary,
    raw: message as unknown as Record<string, unknown>,
    projectId,
    metadata: extractMetadata(message),
  });

  // Additional signal if email is flagged and primary type is not flagged
  if (
    message.flag?.flagStatus === 'flagged' &&
    primarySignalType !== 'email_received'
  ) {
    signals.push({
      id: ulid(),
      source: 'outlook',
      timestamp: raw.timestamp,
      type: 'email_received',
      summary: `Flagged email: ${message.subject}`,
      raw: message as unknown as Record<string, unknown>,
      projectId,
      metadata: {
        ...extractMetadata(message),
        priority: 'high',
      },
    });
  }

  return signals;
}

/**
 * Determine signal type from email properties
 */
function determineSignalType(message: GraphMessage): SignalType {
  // Check if this is a flagged/important email
  if (message.flag?.flagStatus === 'flagged') {
    return 'email_received';
  }

  // Check if this is a high importance email
  if (message.importance === 'high') {
    return 'email_received';
  }

  // Check conversation context to detect thread updates
  // If the email is a reply (has conversationIndex longer than base)
  if (
    message.conversationIndex &&
    message.conversationIndex.length > 44 // Base64 encoded GUID is 44 chars
  ) {
    return 'email_thread_updated';
  }

  // Check subject for reply/forward indicators
  const subjectLower = message.subject?.toLowerCase() || '';
  if (
    subjectLower.startsWith('re:') ||
    subjectLower.startsWith('fw:') ||
    subjectLower.startsWith('fwd:')
  ) {
    return 'email_thread_updated';
  }

  // Default to email_received
  return 'email_received';
}

/**
 * Extract a human-readable summary from the email
 */
function extractSummary(message: GraphMessage, signalType: SignalType): string {
  const from = formatEmailAddress(message.from);
  const subject = message.subject || '(no subject)';

  switch (signalType) {
    case 'email_received':
      if (message.flag?.flagStatus === 'flagged') {
        return `Flagged email from ${from}: ${subject}`;
      }
      if (message.importance === 'high') {
        return `High importance email from ${from}: ${subject}`;
      }
      return `New email from ${from}: ${subject}`;

    case 'email_thread_updated':
      return `Reply from ${from}: ${subject}`;

    default:
      return `Email from ${from}: ${subject}`;
  }
}

/**
 * Extract metadata from the email message
 */
function extractMetadata(message: GraphMessage) {
  const priority = mapImportanceToPriority(message.importance, message.flag);

  return {
    priority,
    participants: extractParticipants(message),
    tags: message.categories,
    emailContext: {
      conversationId: message.conversationId,
      hasAttachments: message.hasAttachments,
      isRead: message.isRead,
      isFlagged: message.flag?.flagStatus === 'flagged',
      inferenceClassification: message.inferenceClassification,
    },
  };
}

/**
 * Extract all participants from an email
 */
function extractParticipants(message: GraphMessage): string[] {
  const participants: string[] = [];

  // From
  if (message.from?.emailAddress?.address) {
    participants.push(message.from.emailAddress.address);
  }

  // To
  if (message.toRecipients) {
    for (const recipient of message.toRecipients) {
      if (recipient.emailAddress?.address) {
        participants.push(recipient.emailAddress.address);
      }
    }
  }

  // CC
  if (message.ccRecipients) {
    for (const recipient of message.ccRecipients) {
      if (recipient.emailAddress?.address) {
        participants.push(recipient.emailAddress.address);
      }
    }
  }

  // Deduplicate
  return [...new Set(participants)];
}

/**
 * Format an email address for display
 */
function formatEmailAddress(address?: EmailAddress): string {
  if (!address?.emailAddress) {
    return 'Unknown';
  }

  const { name, address: email } = address.emailAddress;
  return name ? `${name} <${email}>` : email;
}

/**
 * Map Outlook importance and flag to our priority levels
 */
function mapImportanceToPriority(
  importance?: 'low' | 'normal' | 'high',
  flag?: { flagStatus: 'notFlagged' | 'complete' | 'flagged' }
): 'critical' | 'high' | 'medium' | 'low' | undefined {
  // Flagged emails are high priority
  if (flag?.flagStatus === 'flagged') {
    return 'high';
  }

  // Map importance
  switch (importance) {
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    case 'normal':
    default:
      return 'medium';
  }
}

/**
 * Check if an Outlook signal represents a significant change
 *
 * Used to filter out noise (e.g., read receipts, low-priority emails)
 */
export function isSignificantOutlookChange(signal: NormalisedSignal): boolean {
  const metadata = signal.metadata as {
    priority?: string;
    emailContext?: {
      inferenceClassification?: string;
      isFlagged?: boolean;
    };
  };

  // Always significant if high priority or flagged
  if (metadata?.priority === 'high' || metadata?.priority === 'critical') {
    return true;
  }

  if (metadata?.emailContext?.isFlagged) {
    return true;
  }

  // Filter out "other" (clutter) emails unless they're thread updates
  if (metadata?.emailContext?.inferenceClassification === 'other') {
    return signal.type === 'email_thread_updated';
  }

  // Thread updates are significant
  if (signal.type === 'email_thread_updated') {
    return true;
  }

  // Regular emails in focused inbox are significant
  return metadata?.emailContext?.inferenceClassification === 'focused';
}

/**
 * Check if an email matches monitored addresses
 *
 * Used to filter emails to only those relevant to the project.
 */
export function matchesMonitoredAddresses(
  signal: NormalisedSignal,
  monitoredAddresses: string[]
): boolean {
  if (!monitoredAddresses || monitoredAddresses.length === 0) {
    return true; // No filter = match all
  }

  const participants = signal.metadata?.participants as string[] | undefined;
  if (!participants) {
    return false;
  }

  const normalisedMonitored = monitoredAddresses.map((a) => a.toLowerCase());

  return participants.some((p) =>
    normalisedMonitored.includes(p.toLowerCase())
  );
}

/**
 * Extract project-relevant keywords from an email
 *
 * Useful for categorising emails by project context.
 */
export function extractKeywords(signal: NormalisedSignal): string[] {
  const raw = signal.raw as unknown as GraphMessage;
  const keywords: string[] = [];

  // Extract from subject
  const subject = raw.subject || '';
  const subjectWords = subject
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  keywords.push(...subjectWords);

  // Extract from body preview
  const bodyPreview = raw.bodyPreview || '';
  const previewWords = bodyPreview
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 20); // Limit to first 20 significant words
  keywords.push(...previewWords);

  // Extract from categories
  if (raw.categories) {
    keywords.push(...raw.categories.map((c) => c.toLowerCase()));
  }

  // Deduplicate and filter common words
  const commonWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have',
    'been', 'will', 'your', 'please', 'thanks', 'thank', 'regards',
    'best', 'hello', 'dear', 'sent', 'mail', 'email',
  ]);

  return [...new Set(keywords)].filter((k) => !commonWords.has(k));
}

/**
 * Create an Outlook signal normaliser for use with the signal processing pipeline
 */
export const outlookSignalNormaliser = {
  source: 'outlook' as const,
  normalise: normaliseOutlookSignal,
  normaliseExpanded: normaliseOutlookSignalExpanded,
  isSignificant: isSignificantOutlookChange,
  matchesMonitored: matchesMonitoredAddresses,
  extractKeywords,
};
