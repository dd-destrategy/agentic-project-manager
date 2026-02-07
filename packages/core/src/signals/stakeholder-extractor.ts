/**
 * Deterministic stakeholder extraction from signal metadata.
 * No LLM cost — pure data extraction.
 */

export interface ExtractedActor {
  name: string;
  email?: string;
  role?: string;
  source: string;
  actionType: string;
}

/**
 * Extract actors from a Jira signal payload.
 *
 * Looks for assignee, reporter, and comment author fields.
 */
export function extractActorsFromJiraSignal(
  signal: Record<string, unknown>
): ExtractedActor[] {
  const actors: ExtractedActor[] = [];

  // Extract assignee
  if (signal.assignee && typeof signal.assignee === 'object') {
    const assignee = signal.assignee as Record<string, string>;
    if (assignee.displayName) {
      actors.push({
        name: assignee.displayName,
        email: assignee.emailAddress,
        role: 'assignee',
        source: 'jira',
        actionType: 'assigned',
      });
    }
  }

  // Extract reporter
  if (signal.reporter && typeof signal.reporter === 'object') {
    const reporter = signal.reporter as Record<string, string>;
    if (reporter.displayName) {
      actors.push({
        name: reporter.displayName,
        email: reporter.emailAddress,
        role: 'reporter',
        source: 'jira',
        actionType: 'reported',
      });
    }
  }

  // Extract comment author
  if (signal.author && typeof signal.author === 'object') {
    const author = signal.author as Record<string, string>;
    if (author.displayName) {
      actors.push({
        name: author.displayName,
        email: author.emailAddress,
        role: 'commenter',
        source: 'jira',
        actionType: 'commented',
      });
    }
  }

  return actors;
}

/**
 * Extract actors from an Outlook signal payload.
 *
 * Looks for the sender (from) field in Microsoft Graph API format.
 */
export function extractActorsFromOutlookSignal(
  signal: Record<string, unknown>
): ExtractedActor[] {
  const actors: ExtractedActor[] = [];

  // Extract sender
  if (signal.from && typeof signal.from === 'object') {
    const from = signal.from as Record<string, unknown>;
    const emailAddress = from.emailAddress as
      | Record<string, string>
      | undefined;
    if (emailAddress?.name) {
      actors.push({
        name: emailAddress.name,
        email: emailAddress.address,
        role: 'sender',
        source: 'outlook',
        actionType: 'emailed',
      });
    }
  }

  return actors;
}
