import type { ArtefactType } from '@/types';

/**
 * Format artefact content as markdown
 */
export function artefactToMarkdown(type: ArtefactType, content: unknown): string {
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;

  switch (type) {
    case 'delivery_state':
      return formatDeliveryStateMarkdown(parsed);
    case 'raid_log':
      return formatRaidLogMarkdown(parsed);
    case 'backlog_summary':
      return formatBacklogSummaryMarkdown(parsed);
    case 'decision_log':
      return formatDecisionLogMarkdown(parsed);
    default:
      return JSON.stringify(parsed, null, 2);
  }
}

function formatDeliveryStateMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = ['# Delivery State', ''];

  lines.push(`**Overall Status:** ${data.overallStatus || 'Unknown'}`);
  lines.push(`**Summary:** ${data.statusSummary || 'No summary available.'}`);
  lines.push('');

  if (data.milestones && Array.isArray(data.milestones) && data.milestones.length > 0) {
    lines.push('## Milestones', '');
    for (const m of data.milestones) {
      const milestone = m as Record<string, string>;
      lines.push(`- **${milestone.name || 'Unnamed'}** — ${milestone.status || 'unknown'} (${milestone.dueDate || 'no date'})`);
    }
    lines.push('');
  }

  if (data.blockers && Array.isArray(data.blockers) && data.blockers.length > 0) {
    lines.push('## Blockers', '');
    for (const b of data.blockers) {
      const blocker = b as Record<string, string>;
      lines.push(`- **${blocker.description || blocker.title || 'Unknown'}** — Owner: ${blocker.owner || 'unassigned'}`);
    }
    lines.push('');
  }

  if (data.keyMetrics && typeof data.keyMetrics === 'object') {
    const metrics = data.keyMetrics as Record<string, unknown>;
    lines.push('## Key Metrics', '');
    lines.push(`- Velocity Trend: ${metrics.velocityTrend || 'N/A'}`);
    lines.push(`- Avg Cycle Time: ${metrics.avgCycleTimeDays || 0} days`);
    lines.push(`- Open Blockers: ${metrics.openBlockers || 0}`);
    lines.push(`- Active Risks: ${metrics.activeRisks || 0}`);
    lines.push('');
  }

  if (data.nextActions && Array.isArray(data.nextActions) && data.nextActions.length > 0) {
    lines.push('## Next Actions', '');
    for (const a of data.nextActions) {
      lines.push(`- ${typeof a === 'string' ? a : (a as Record<string, string>).description || JSON.stringify(a)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatRaidLogMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = ['# RAID Log', ''];

  const items = (data.items as Array<Record<string, string>>) || [];

  if (items.length === 0) {
    lines.push('No items recorded.');
    return lines.join('\n');
  }

  const grouped: Record<string, Array<Record<string, string>>> = {};
  for (const item of items) {
    const type = item.type || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type]!.push(item);
  }

  for (const [type, groupItems] of Object.entries(grouped)) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s`, '');
    lines.push('| Status | Description | Owner | Date |');
    lines.push('|--------|-------------|-------|------|');
    for (const item of groupItems) {
      lines.push(`| ${item.status || '-'} | ${item.description || item.title || '-'} | ${item.owner || '-'} | ${item.identifiedDate || item.raisedDate || '-'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatBacklogSummaryMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = ['# Backlog Summary', ''];

  const summary = data.summary as Record<string, unknown> | undefined;
  if (summary) {
    lines.push(`**Source:** ${data.source || 'Unknown'}`);
    lines.push(`**Last Synced:** ${data.lastSynced || 'Unknown'}`);
    lines.push(`**Total Items:** ${summary.totalItems || 0}`);
    lines.push('');

    const byStatus = summary.byStatus as Record<string, number> | undefined;
    if (byStatus) {
      lines.push('## By Status', '');
      lines.push(`- To Do: ${byStatus.toDo || 0}`);
      lines.push(`- In Progress: ${byStatus.inProgress || 0}`);
      lines.push(`- Done This Sprint: ${byStatus.doneThisSprint || 0}`);
      lines.push(`- Blocked: ${byStatus.blocked || 0}`);
      lines.push('');
    }

    const byPriority = summary.byPriority as Record<string, number> | undefined;
    if (byPriority) {
      lines.push('## By Priority', '');
      lines.push(`- Critical: ${byPriority.critical || 0}`);
      lines.push(`- High: ${byPriority.high || 0}`);
      lines.push(`- Medium: ${byPriority.medium || 0}`);
      lines.push(`- Low: ${byPriority.low || 0}`);
      lines.push('');
    }
  }

  const highlights = (data.highlights as string[]) || [];
  if (highlights.length > 0) {
    lines.push('## Highlights', '');
    for (const h of highlights) {
      lines.push(`- ${h}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatDecisionLogMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = ['# Decision Log', ''];

  const decisions = (data.decisions as Array<Record<string, unknown>>) || [];

  if (decisions.length === 0) {
    lines.push('No decisions recorded.');
    return lines.join('\n');
  }

  for (const decision of decisions) {
    lines.push(`## ${decision.title || 'Untitled Decision'}`);
    lines.push('');
    lines.push(`**Date:** ${decision.date || decision.decidedDate || 'Unknown'}`);
    lines.push(`**Status:** ${decision.status || 'Unknown'}`);
    if (decision.context) lines.push(`**Context:** ${decision.context}`);
    if (decision.decision) lines.push(`**Decision:** ${decision.decision}`);
    if (decision.rationale) lines.push(`**Rationale:** ${decision.rationale}`);
    if (decision.owner) lines.push(`**Owner:** ${decision.owner}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format artefact content as JSON
 */
export function artefactToJson(content: unknown): string {
  const parsed = typeof content === 'string' ? JSON.parse(content) : content;
  return JSON.stringify(parsed, null, 2);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textarea);
    return result;
  }
}

/**
 * Export all artefacts as a combined markdown document
 */
export function allArtefactsToMarkdown(artefacts: Array<{ type: ArtefactType; content: unknown }>): string {
  const sections = artefacts.map(a => artefactToMarkdown(a.type, a.content));
  return sections.join('\n\n---\n\n');
}
