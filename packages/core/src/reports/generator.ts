/**
 * Status Report Generator
 *
 * Deterministic report generation from artefact data.
 * No LLM call needed — extracts and formats data from the four artefact types.
 * Supports three templates: executive, team, steering_committee.
 */

import type { Artefact } from '../types/index.js';
import type {
  DeliveryStateContent,
  RaidLogContent,
  BacklogSummaryContent,
  DecisionLogContent,
} from '../types/index.js';
import type { ReportContent, ReportTemplate, StatusReport } from './types.js';

/**
 * Input artefacts keyed by type
 */
export interface GeneratorInput {
  delivery_state?: Artefact;
  raid_log?: Artefact;
  backlog_summary?: Artefact;
  decision_log?: Artefact;
}

/**
 * Recent event summary for context
 */
export interface RecentEventSummary {
  totalEvents: number;
  signalsDetected: number;
  actionsTaken: number;
  escalationsCreated: number;
}

/**
 * Generate a status report from artefact data
 */
export class StatusReportGenerator {
  /**
   * Generate a report for a project
   */
  generateReport(
    projectId: string,
    template: ReportTemplate,
    artefacts: GeneratorInput,
    recentEvents?: RecentEventSummary
  ): StatusReport {
    const content = this.buildContent(template, artefacts, recentEvents);
    const title = this.buildTitle(template);
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      projectId,
      template,
      title,
      content,
      generatedAt: now,
      status: 'draft',
    };
  }

  /**
   * Build report content based on template type
   */
  private buildContent(
    template: ReportTemplate,
    artefacts: GeneratorInput,
    recentEvents?: RecentEventSummary
  ): ReportContent {
    const deliveryState = artefacts.delivery_state?.content as
      | DeliveryStateContent
      | undefined;
    const raidLog = artefacts.raid_log?.content as
      | RaidLogContent
      | undefined;
    const backlogSummary = artefacts.backlog_summary?.content as
      | BacklogSummaryContent
      | undefined;
    const decisionLog = artefacts.decision_log?.content as
      | DecisionLogContent
      | undefined;

    switch (template) {
      case 'executive':
        return this.buildExecutiveContent(
          deliveryState,
          raidLog,
          backlogSummary,
          decisionLog,
          recentEvents
        );
      case 'team':
        return this.buildTeamContent(
          deliveryState,
          raidLog,
          backlogSummary,
          decisionLog,
          recentEvents
        );
      case 'steering_committee':
        return this.buildSteeringContent(
          deliveryState,
          raidLog,
          backlogSummary,
          decisionLog,
          recentEvents
        );
    }
  }

  /**
   * Executive template: brief, metrics-focused
   */
  private buildExecutiveContent(
    deliveryState?: DeliveryStateContent,
    raidLog?: RaidLogContent,
    backlogSummary?: BacklogSummaryContent,
    decisionLog?: DecisionLogContent,
    recentEvents?: RecentEventSummary
  ): ReportContent {
    const healthStatus = deliveryState?.overallStatus ?? 'unknown';
    const summary = deliveryState?.statusSummary ?? 'No delivery state available.';

    const keyHighlights = this.extractHighlights(deliveryState, backlogSummary);
    const risksAndBlockers = this.extractTopRisksAndBlockers(raidLog, deliveryState);
    const decisionsNeeded = this.extractPendingDecisions(decisionLog);
    const upcomingMilestones = this.extractMilestones(deliveryState);
    const metricsSnapshot = this.buildMetricsSnapshot(
      deliveryState,
      backlogSummary,
      raidLog,
      recentEvents
    );

    return {
      summary: `Executive Summary: ${summary}`,
      healthStatus,
      keyHighlights: keyHighlights.slice(0, 3),
      risksAndBlockers: risksAndBlockers.slice(0, 3),
      decisionsNeeded: decisionsNeeded.slice(0, 3),
      upcomingMilestones: upcomingMilestones.slice(0, 3),
      metricsSnapshot,
    };
  }

  /**
   * Team template: detailed, action-oriented
   */
  private buildTeamContent(
    deliveryState?: DeliveryStateContent,
    raidLog?: RaidLogContent,
    backlogSummary?: BacklogSummaryContent,
    decisionLog?: DecisionLogContent,
    recentEvents?: RecentEventSummary
  ): ReportContent {
    const healthStatus = deliveryState?.overallStatus ?? 'unknown';
    const summary = deliveryState?.statusSummary ?? 'No delivery state available.';

    const keyHighlights = this.extractHighlights(deliveryState, backlogSummary);
    const risksAndBlockers = this.extractAllRisksAndBlockers(raidLog, deliveryState);
    const decisionsNeeded = this.extractPendingDecisions(decisionLog);
    const upcomingMilestones = this.extractMilestones(deliveryState);
    const metricsSnapshot = this.buildMetricsSnapshot(
      deliveryState,
      backlogSummary,
      raidLog,
      recentEvents
    );

    // Add next actions for team context
    const nextActions = deliveryState?.nextActions ?? [];
    const actionHighlights = nextActions.map((a) => `Action: ${a}`);

    return {
      summary: `Team Update: ${summary}`,
      healthStatus,
      keyHighlights: [...keyHighlights, ...actionHighlights],
      risksAndBlockers,
      decisionsNeeded,
      upcomingMilestones,
      metricsSnapshot,
    };
  }

  /**
   * Steering committee template: risk-focused
   */
  private buildSteeringContent(
    deliveryState?: DeliveryStateContent,
    raidLog?: RaidLogContent,
    backlogSummary?: BacklogSummaryContent,
    decisionLog?: DecisionLogContent,
    recentEvents?: RecentEventSummary
  ): ReportContent {
    const healthStatus = deliveryState?.overallStatus ?? 'unknown';
    const summary = deliveryState?.statusSummary ?? 'No delivery state available.';

    const keyHighlights = this.extractHighlights(deliveryState, backlogSummary);
    const risksAndBlockers = this.extractAllRisksAndBlockers(raidLog, deliveryState);
    const decisionsNeeded = this.extractAllDecisions(decisionLog);
    const upcomingMilestones = this.extractMilestones(deliveryState);
    const metricsSnapshot = this.buildMetricsSnapshot(
      deliveryState,
      backlogSummary,
      raidLog,
      recentEvents
    );

    return {
      summary: `Steering Committee Report: ${summary}`,
      healthStatus,
      keyHighlights: keyHighlights.slice(0, 5),
      risksAndBlockers,
      decisionsNeeded,
      upcomingMilestones,
      metricsSnapshot,
    };
  }

  /**
   * Extract key highlights from delivery state and backlog
   */
  private extractHighlights(
    deliveryState?: DeliveryStateContent,
    backlogSummary?: BacklogSummaryContent
  ): string[] {
    const highlights: string[] = [];

    if (deliveryState) {
      highlights.push(`Overall status: ${deliveryState.overallStatus}`);

      if (deliveryState.currentSprint) {
        const sprint = deliveryState.currentSprint;
        const progress = sprint.progress;
        const completion =
          progress.totalPoints > 0
            ? Math.round(
                (progress.completedPoints / progress.totalPoints) * 100
              )
            : 0;
        highlights.push(
          `Sprint "${sprint.name}": ${completion}% complete (${progress.completedPoints}/${progress.totalPoints} points)`
        );
      }

      highlights.push(
        `Velocity trend: ${deliveryState.keyMetrics.velocityTrend}`
      );
    }

    if (backlogSummary) {
      highlights.push(
        `Backlog: ${backlogSummary.summary.totalItems} total items, ${backlogSummary.summary.byStatus.inProgress} in progress`
      );
    }

    return highlights;
  }

  /**
   * Extract top risks and blockers (limited for executive view)
   */
  private extractTopRisksAndBlockers(
    raidLog?: RaidLogContent,
    deliveryState?: DeliveryStateContent
  ): string[] {
    const items: string[] = [];

    // Blockers from delivery state
    if (deliveryState?.blockers) {
      for (const blocker of deliveryState.blockers.slice(0, 2)) {
        items.push(`[Blocker] ${blocker.description} (Owner: ${blocker.owner})`);
      }
    }

    // High/critical risks from RAID log
    if (raidLog?.items) {
      const openRisks = raidLog.items.filter(
        (item) =>
          item.type === 'risk' &&
          item.status === 'open' &&
          (item.severity === 'critical' || item.severity === 'high')
      );
      for (const risk of openRisks.slice(0, 2)) {
        items.push(`[Risk] ${risk.title} — ${risk.severity}`);
      }
    }

    return items;
  }

  /**
   * Extract all risks and blockers (for team/steering)
   */
  private extractAllRisksAndBlockers(
    raidLog?: RaidLogContent,
    deliveryState?: DeliveryStateContent
  ): string[] {
    const items: string[] = [];

    // Blockers from delivery state
    if (deliveryState?.blockers) {
      for (const blocker of deliveryState.blockers) {
        items.push(
          `[Blocker] ${blocker.description} (Owner: ${blocker.owner}, Severity: ${blocker.severity})`
        );
      }
    }

    // All open risks/issues from RAID log
    if (raidLog?.items) {
      const openItems = raidLog.items.filter(
        (item) =>
          (item.type === 'risk' || item.type === 'issue') &&
          (item.status === 'open' || item.status === 'mitigating')
      );
      for (const item of openItems) {
        items.push(
          `[${item.type.charAt(0).toUpperCase() + item.type.slice(1)}] ${item.title} — ${item.severity} (${item.status})`
        );
      }
    }

    return items;
  }

  /**
   * Extract pending decisions (limited)
   */
  private extractPendingDecisions(
    decisionLog?: DecisionLogContent
  ): string[] {
    if (!decisionLog?.decisions) return [];

    return decisionLog.decisions
      .filter((d) => d.status === 'active')
      .slice(0, 5)
      .map((d) => `${d.title} — decided by ${d.madeBy} on ${d.date.split('T')[0]}`);
  }

  /**
   * Extract all decisions (for steering committee)
   */
  private extractAllDecisions(
    decisionLog?: DecisionLogContent
  ): string[] {
    if (!decisionLog?.decisions) return [];

    return decisionLog.decisions.map(
      (d) =>
        `[${d.status}] ${d.title} — ${d.decision} (${d.madeBy}, ${d.date.split('T')[0]})`
    );
  }

  /**
   * Extract upcoming milestones
   */
  private extractMilestones(
    deliveryState?: DeliveryStateContent
  ): string[] {
    if (!deliveryState?.milestones) return [];

    return deliveryState.milestones
      .filter((m) => m.status !== 'completed')
      .map(
        (m) =>
          `${m.name} — due ${m.dueDate.split('T')[0]} (${m.status.replace('_', ' ')})`
      );
  }

  /**
   * Build metrics snapshot
   */
  private buildMetricsSnapshot(
    deliveryState?: DeliveryStateContent,
    backlogSummary?: BacklogSummaryContent,
    raidLog?: RaidLogContent,
    recentEvents?: RecentEventSummary
  ): Record<string, string | number> {
    const metrics: Record<string, string | number> = {};

    if (deliveryState) {
      metrics['overallStatus'] = deliveryState.overallStatus;
      metrics['openBlockers'] = deliveryState.keyMetrics.openBlockers;
      metrics['activeRisks'] = deliveryState.keyMetrics.activeRisks;
      metrics['velocityTrend'] = deliveryState.keyMetrics.velocityTrend;
      metrics['avgCycleTimeDays'] = deliveryState.keyMetrics.avgCycleTimeDays;
    }

    if (backlogSummary) {
      metrics['totalBacklogItems'] = backlogSummary.summary.totalItems;
      metrics['inProgress'] = backlogSummary.summary.byStatus.inProgress;
      metrics['blocked'] = backlogSummary.summary.byStatus.blocked;
      metrics['doneThisSprint'] = backlogSummary.summary.byStatus.doneThisSprint;
    }

    if (raidLog) {
      const openItems = raidLog.items.filter(
        (i) => i.status === 'open' || i.status === 'mitigating'
      );
      metrics['openRaidItems'] = openItems.length;
    }

    if (recentEvents) {
      metrics['recentSignals'] = recentEvents.signalsDetected;
      metrics['recentActions'] = recentEvents.actionsTaken;
    }

    return metrics;
  }

  /**
   * Build a title for the report based on template
   */
  private buildTitle(template: ReportTemplate): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    switch (template) {
      case 'executive':
        return `Executive Status Report — ${dateStr}`;
      case 'team':
        return `Team Status Update — ${dateStr}`;
      case 'steering_committee':
        return `Steering Committee Report — ${dateStr}`;
    }
  }
}
