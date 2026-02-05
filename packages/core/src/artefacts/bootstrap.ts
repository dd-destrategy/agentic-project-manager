/**
 * Artefact Bootstrap
 *
 * Generates initial artefacts from Jira data for new projects.
 * Creates DeliveryState, RAIDLog, BacklogSummary, and empty DecisionLog.
 */

import { DynamoDBClient } from '../db/client.js';
import { ArtefactRepository } from '../db/repositories/artefact.js';
import type { JiraIssue, JiraSprint } from '../integrations/jira.js';
import type {
  DeliveryStateContent,
  RaidLogContent,
  BacklogSummaryContent,
  DecisionLogContent,
  RaidItem,
  Blocker,
  BacklogHighlight,
  SprintInfo,
  KeyMetrics,
  ArtefactType,
  Artefact,
} from '../types/index.js';

/**
 * Input for artefact bootstrap
 */
export interface BootstrapInput {
  projectId: string;
  projectKey: string;
  issues: JiraIssue[];
  activeSprint: JiraSprint | null;
  boardId?: string;
}

/**
 * Result of artefact bootstrap
 */
export interface BootstrapResult {
  success: boolean;
  artefacts: Artefact[];
  errors?: string[];
}

/**
 * Issue status mappings for Jira
 */
const STATUS_MAPPINGS = {
  toDo: ['To Do', 'Open', 'Backlog', 'New', 'Pending'],
  inProgress: ['In Progress', 'In Development', 'In Review', 'Active', 'Doing'],
  done: ['Done', 'Closed', 'Resolved', 'Complete', 'Completed'],
  blocked: ['Blocked', 'On Hold', 'Impediment'],
} as const;

/**
 * Priority mappings for Jira
 */
const PRIORITY_MAPPINGS = {
  critical: ['Highest', 'Blocker', 'Critical'],
  high: ['High', 'Major'],
  medium: ['Medium', 'Normal'],
  low: ['Low', 'Lowest', 'Minor', 'Trivial'],
} as const;

/**
 * Bootstrap artefacts from Jira data for a new project
 */
export async function bootstrapArtefactsFromJira(
  input: BootstrapInput,
  db?: DynamoDBClient
): Promise<BootstrapResult> {
  const client = db ?? new DynamoDBClient();
  const repo = new ArtefactRepository(client);
  const now = new Date().toISOString();

  try {
    // Generate all artefact contents
    const deliveryState = generateDeliveryState(input, now);
    const raidLog = generateRaidLog(input, now);
    const backlogSummary = generateBacklogSummary(input, now);
    const decisionLog = generateDecisionLog();

    // Store all artefacts
    const artefacts: Artefact[] = [];

    const types: Array<{
      type: ArtefactType;
      content: DeliveryStateContent | RaidLogContent | BacklogSummaryContent | DecisionLogContent;
    }> = [
      { type: 'delivery_state', content: deliveryState },
      { type: 'raid_log', content: raidLog },
      { type: 'backlog_summary', content: backlogSummary },
      { type: 'decision_log', content: decisionLog },
    ];

    for (const { type, content } of types) {
      const artefact = await repo.upsert(input.projectId, type, content, {
        updatedBy: 'agent',
        rationale: 'Initial artefact bootstrap from Jira data',
      });
      artefacts.push(artefact);
    }

    return {
      success: true,
      artefacts,
    };
  } catch (error) {
    return {
      success: false,
      artefacts: [],
      errors: [error instanceof Error ? error.message : 'Unknown error during bootstrap'],
    };
  }
}

/**
 * Generate DeliveryState from Jira data
 */
function generateDeliveryState(input: BootstrapInput, now: string): DeliveryStateContent {
  const { issues, activeSprint } = input;

  // Calculate issue counts by status
  const statusCounts = calculateStatusCounts(issues);
  const blockedIssues = issues.filter((issue) => isBlockedStatus(issue.fields.status.name));

  // Determine overall status based on blockers and progress
  const overallStatus = determineOverallStatus(blockedIssues.length, statusCounts);

  // Generate blockers from blocked issues
  const blockers = generateBlockers(blockedIssues, now);

  // Generate sprint info if active sprint exists
  const currentSprint = activeSprint ? generateSprintInfo(activeSprint, issues) : undefined;

  // Calculate key metrics
  const keyMetrics = calculateKeyMetrics(issues, blockedIssues);

  // Generate status summary
  const statusSummary = generateStatusSummary(
    overallStatus,
    statusCounts,
    blockedIssues.length,
    activeSprint
  );

  // Generate next actions
  const nextActions = generateNextActions(blockedIssues, statusCounts);

  return {
    overallStatus,
    statusSummary,
    currentSprint,
    milestones: [], // Milestones are typically added manually
    blockers,
    keyMetrics,
    nextActions,
  };
}

/**
 * Generate RAIDLog from Jira data
 */
function generateRaidLog(input: BootstrapInput, now: string): RaidLogContent {
  const { issues, projectKey: _projectKey } = input;
  const items: RaidItem[] = [];

  // Find issues that indicate risks, blockers, or dependencies
  for (const issue of issues) {
    const status = issue.fields.status.name;
    const labels = issue.fields.labels ?? [];
    const priority = issue.fields.priority?.name ?? 'Medium';

    // Blocked issues become Issues in RAID log
    if (isBlockedStatus(status)) {
      items.push({
        id: `I-${issue.key}`,
        type: 'issue',
        title: `Blocked: ${issue.fields.summary}`,
        description: `Issue ${issue.key} is blocked. Current status: ${status}`,
        severity: mapPriorityToSeverity(priority),
        status: 'open',
        owner: issue.fields.assignee?.displayName ?? 'Unassigned',
        raisedDate: issue.fields.created,
        source: 'integration_signal',
        sourceReference: issue.key,
        lastReviewed: now,
      });
    }

    // High priority issues become Risks
    if (priority === 'Highest' || priority === 'Blocker' || priority === 'Critical') {
      // Skip if already added as blocked issue
      if (!isBlockedStatus(status)) {
        items.push({
          id: `R-${issue.key}`,
          type: 'risk',
          title: `High priority: ${issue.fields.summary}`,
          description: `Critical priority issue ${issue.key} requires attention.`,
          severity: 'high',
          status: isCompletedStatus(status) ? 'resolved' : 'open',
          owner: issue.fields.assignee?.displayName ?? 'Unassigned',
          raisedDate: issue.fields.created,
          resolvedDate: isCompletedStatus(status) ? issue.fields.updated : undefined,
          source: 'integration_signal',
          sourceReference: issue.key,
          lastReviewed: now,
        });
      }
    }

    // Check labels for dependencies
    const dependencyLabels = labels.filter(
      (l: string) =>
        l.toLowerCase().includes('dependency') ||
        l.toLowerCase().includes('blocked-by') ||
        l.toLowerCase().includes('depends-on')
    );

    if (dependencyLabels.length > 0) {
      items.push({
        id: `D-${issue.key}`,
        type: 'dependency',
        title: `Dependency: ${issue.fields.summary}`,
        description: `Issue ${issue.key} has dependency labels: ${dependencyLabels.join(', ')}`,
        severity: mapPriorityToSeverity(priority),
        status: isCompletedStatus(status) ? 'resolved' : 'open',
        owner: issue.fields.assignee?.displayName ?? 'Unassigned',
        raisedDate: issue.fields.created,
        source: 'integration_signal',
        sourceReference: issue.key,
        lastReviewed: now,
      });
    }
  }

  return { items };
}

/**
 * Generate BacklogSummary from Jira data
 */
function generateBacklogSummary(input: BootstrapInput, now: string): BacklogSummaryContent {
  const { issues, activeSprint } = input;

  // Calculate status counts
  const statusCounts = calculateStatusCounts(issues);

  // Calculate priority counts
  const priorityCounts = calculatePriorityCounts(issues);

  // Find issues that need attention (highlights)
  const highlights = generateHighlights(issues, activeSprint);

  // Find refinement candidates (no story points, vague descriptions, etc.)
  const refinementCandidates = findRefinementCandidates(issues);

  return {
    source: 'jira',
    lastSynced: now,
    summary: {
      totalItems: issues.length,
      byStatus: {
        toDo: statusCounts.toDo,
        inProgress: statusCounts.inProgress,
        doneThisSprint: statusCounts.done,
        blocked: statusCounts.blocked,
      },
      byPriority: {
        critical: priorityCounts.critical,
        high: priorityCounts.high,
        medium: priorityCounts.medium,
        low: priorityCounts.low,
      },
    },
    highlights,
    refinementCandidates,
  };
}

/**
 * Generate empty DecisionLog
 */
function generateDecisionLog(): DecisionLogContent {
  return {
    decisions: [],
  };
}

/**
 * Calculate issue counts by status category
 */
function calculateStatusCounts(issues: JiraIssue[]): {
  toDo: number;
  inProgress: number;
  done: number;
  blocked: number;
} {
  const counts = { toDo: 0, inProgress: 0, done: 0, blocked: 0 };

  for (const issue of issues) {
    const status = issue.fields.status.name;

    if (isBlockedStatus(status)) {
      counts.blocked++;
    } else if (isCompletedStatus(status)) {
      counts.done++;
    } else if (isInProgressStatus(status)) {
      counts.inProgress++;
    } else {
      counts.toDo++;
    }
  }

  return counts;
}

/**
 * Calculate issue counts by priority
 */
function calculatePriorityCounts(issues: JiraIssue[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const issue of issues) {
    const priority = issue.fields.priority?.name ?? 'Medium';

    if (PRIORITY_MAPPINGS.critical.includes(priority as typeof PRIORITY_MAPPINGS.critical[number])) {
      counts.critical++;
    } else if (PRIORITY_MAPPINGS.high.includes(priority as typeof PRIORITY_MAPPINGS.high[number])) {
      counts.high++;
    } else if (PRIORITY_MAPPINGS.medium.includes(priority as typeof PRIORITY_MAPPINGS.medium[number])) {
      counts.medium++;
    } else {
      counts.low++;
    }
  }

  return counts;
}

/**
 * Check if status indicates blocked
 */
function isBlockedStatus(status: string): boolean {
  return STATUS_MAPPINGS.blocked.some(
    (s) => s.toLowerCase() === status.toLowerCase()
  );
}

/**
 * Check if status indicates completed
 */
function isCompletedStatus(status: string): boolean {
  return STATUS_MAPPINGS.done.some(
    (s) => s.toLowerCase() === status.toLowerCase()
  );
}

/**
 * Check if status indicates in progress
 */
function isInProgressStatus(status: string): boolean {
  return STATUS_MAPPINGS.inProgress.some(
    (s) => s.toLowerCase() === status.toLowerCase()
  );
}

/**
 * Determine overall project status
 */
function determineOverallStatus(
  blockedCount: number,
  statusCounts: { toDo: number; inProgress: number; done: number; blocked: number }
): 'green' | 'amber' | 'red' {
  const total = statusCounts.toDo + statusCounts.inProgress + statusCounts.done + blockedCount;

  if (blockedCount >= 3 || (total > 0 && blockedCount / total > 0.2)) {
    return 'red';
  }

  if (blockedCount >= 1 || (total > 0 && statusCounts.inProgress / total < 0.1)) {
    return 'amber';
  }

  return 'green';
}

/**
 * Generate blockers from blocked issues
 */
function generateBlockers(blockedIssues: JiraIssue[], _now: string): Blocker[] {
  return blockedIssues.slice(0, 10).map((issue) => ({
    id: issue.key,
    description: issue.fields.summary,
    owner: issue.fields.assignee?.displayName ?? 'Unassigned',
    raisedDate: issue.fields.updated,
    severity: mapPriorityToBlockerSeverity(issue.fields.priority?.name ?? 'Medium'),
    sourceTicket: issue.key,
  }));
}

/**
 * Generate sprint info from Jira sprint data
 */
function generateSprintInfo(sprint: JiraSprint, issues: JiraIssue[]): SprintInfo {
  const sprintIssues = issues; // Assume all issues are in the sprint for bootstrap
  const statusCounts = calculateStatusCounts(sprintIssues);

  // Calculate story points (using a simple heuristic - 1 issue = 1 point)
  // In reality, this would need to read the story points custom field
  const totalPoints = sprintIssues.length;
  const completedPoints = statusCounts.done;
  const inProgressPoints = statusCounts.inProgress;
  const blockedPoints = statusCounts.blocked;

  return {
    name: sprint.name,
    startDate: sprint.startDate ?? new Date().toISOString(),
    endDate: sprint.endDate ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    goal: sprint.goal ?? 'No sprint goal defined',
    progress: {
      totalPoints,
      completedPoints,
      inProgressPoints,
      blockedPoints,
    },
  };
}

/**
 * Calculate key metrics from issues
 */
function calculateKeyMetrics(issues: JiraIssue[], blockedIssues: JiraIssue[]): KeyMetrics {
  // Calculate average cycle time (from created to done)
  const completedIssues = issues.filter((i) => isCompletedStatus(i.fields.status.name));
  let avgCycleTimeDays = 0;

  if (completedIssues.length > 0) {
    const totalCycleTime = completedIssues.reduce((sum, issue) => {
      const created = new Date(issue.fields.created).getTime();
      const updated = new Date(issue.fields.updated).getTime();
      return sum + (updated - created);
    }, 0);
    avgCycleTimeDays = Math.round(
      totalCycleTime / completedIssues.length / (1000 * 60 * 60 * 24)
    );
  }

  // Count active risks (high priority non-completed issues)
  const activeRisks = issues.filter(
    (i) =>
      !isCompletedStatus(i.fields.status.name) &&
      (i.fields.priority?.name === 'Highest' ||
        i.fields.priority?.name === 'Critical' ||
        i.fields.priority?.name === 'Blocker')
  ).length;

  return {
    velocityTrend: 'stable', // Would need historical data to calculate
    avgCycleTimeDays,
    openBlockers: blockedIssues.length,
    activeRisks,
  };
}

/**
 * Generate status summary text
 */
function generateStatusSummary(
  status: 'green' | 'amber' | 'red',
  counts: { toDo: number; inProgress: number; done: number; blocked: number },
  blockedCount: number,
  sprint: JiraSprint | null
): string {
  const parts: string[] = [];

  if (sprint) {
    parts.push(`Active sprint: ${sprint.name}.`);
  }

  const total = counts.toDo + counts.inProgress + counts.done + blockedCount;
  parts.push(`${total} issues total: ${counts.done} done, ${counts.inProgress} in progress, ${counts.toDo} to do.`);

  if (blockedCount > 0) {
    parts.push(`${blockedCount} issue${blockedCount > 1 ? 's' : ''} currently blocked.`);
  }

  if (status === 'red') {
    parts.push('Delivery at risk - immediate attention required.');
  } else if (status === 'amber') {
    parts.push('Some concerns require attention.');
  } else {
    parts.push('Project is progressing well.');
  }

  return parts.join(' ');
}

/**
 * Generate next actions based on current state
 */
function generateNextActions(
  blockedIssues: JiraIssue[],
  counts: { toDo: number; inProgress: number; done: number; blocked: number }
): string[] {
  const actions: string[] = [];

  if (blockedIssues.length > 0) {
    actions.push(`Resolve ${blockedIssues.length} blocked issue${blockedIssues.length > 1 ? 's' : ''}`);
    const firstBlocked = blockedIssues[0];
    if (firstBlocked) {
      actions.push(`Review blocker: ${firstBlocked.key} - ${firstBlocked.fields.summary.slice(0, 50)}`);
    }
  }

  if (counts.inProgress === 0 && counts.toDo > 0) {
    actions.push('Start work on backlog items - no items currently in progress');
  }

  if (actions.length === 0) {
    actions.push('Continue current sprint work');
  }

  return actions.slice(0, 5);
}

/**
 * Generate highlights for backlog summary
 */
function generateHighlights(
  issues: JiraIssue[],
  _sprint: JiraSprint | null
): BacklogHighlight[] {
  const highlights: BacklogHighlight[] = [];
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  for (const issue of issues) {
    const status = issue.fields.status.name;
    const updated = new Date(issue.fields.updated).getTime();
    const created = new Date(issue.fields.created).getTime();

    // Blocked items
    if (isBlockedStatus(status)) {
      highlights.push({
        ticketId: issue.key,
        title: issue.fields.summary,
        flag: 'blocked',
        detail: `Issue has been blocked since ${issue.fields.updated}`,
        suggestedAction: 'Identify and resolve blocking dependency',
      });
    }

    // Stale items (not updated in 14 days, not done)
    if (updated < fourteenDaysAgo && !isCompletedStatus(status)) {
      highlights.push({
        ticketId: issue.key,
        title: issue.fields.summary,
        flag: 'stale',
        detail: `No updates for over 14 days. Last updated: ${issue.fields.updated}`,
        suggestedAction: 'Review and update status or close if no longer relevant',
      });
    }

    // New items (created in last 7 days)
    if (created > sevenDaysAgo) {
      highlights.push({
        ticketId: issue.key,
        title: issue.fields.summary,
        flag: 'new',
        detail: `Recently created on ${issue.fields.created}`,
      });
    }

    // Limit highlights
    if (highlights.length >= 20) {
      break;
    }
  }

  return highlights.slice(0, 10);
}

/**
 * Find issues that need refinement
 */
function findRefinementCandidates(issues: JiraIssue[]): Array<{
  ticketId: string;
  title: string;
  issue: string;
}> {
  const candidates: Array<{
    ticketId: string;
    title: string;
    issue: string;
  }> = [];

  for (const issue of issues) {
    const status = issue.fields.status.name;

    // Skip completed issues
    if (isCompletedStatus(status)) {
      continue;
    }

    // Check for missing description
    if (!issue.fields.description) {
      candidates.push({
        ticketId: issue.key,
        title: issue.fields.summary,
        issue: 'Missing description - needs acceptance criteria',
      });
    }

    // Check for very short summary (likely needs more detail)
    if (issue.fields.summary.length < 15) {
      candidates.push({
        ticketId: issue.key,
        title: issue.fields.summary,
        issue: 'Summary too brief - consider adding more context',
      });
    }

    if (candidates.length >= 10) {
      break;
    }
  }

  return candidates;
}

/**
 * Map Jira priority to RAID severity
 */
function mapPriorityToSeverity(
  priority: string
): 'critical' | 'high' | 'medium' | 'low' {
  if (PRIORITY_MAPPINGS.critical.includes(priority as typeof PRIORITY_MAPPINGS.critical[number])) {
    return 'critical';
  }
  if (PRIORITY_MAPPINGS.high.includes(priority as typeof PRIORITY_MAPPINGS.high[number])) {
    return 'high';
  }
  if (PRIORITY_MAPPINGS.medium.includes(priority as typeof PRIORITY_MAPPINGS.medium[number])) {
    return 'medium';
  }
  return 'low';
}

/**
 * Map Jira priority to blocker severity
 */
function mapPriorityToBlockerSeverity(priority: string): 'high' | 'medium' | 'low' {
  if (
    PRIORITY_MAPPINGS.critical.includes(priority as typeof PRIORITY_MAPPINGS.critical[number]) ||
    PRIORITY_MAPPINGS.high.includes(priority as typeof PRIORITY_MAPPINGS.high[number])
  ) {
    return 'high';
  }
  if (PRIORITY_MAPPINGS.medium.includes(priority as typeof PRIORITY_MAPPINGS.medium[number])) {
    return 'medium';
  }
  return 'low';
}
