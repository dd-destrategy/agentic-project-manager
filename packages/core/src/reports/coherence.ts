/**
 * Artefact Coherence Auditor
 *
 * Checks cross-artefact consistency. Runs deterministically (no LLM cost).
 */

import type { ArtefactType } from '../types/index.js';

export interface CoherenceIssue {
  severity: 'info' | 'warning' | 'error';
  artefactType: ArtefactType;
  field: string;
  message: string;
  suggestion?: string;
}

interface ArtefactSet {
  deliveryState?: {
    blockers?: Array<{ id: string; description: string; severity: string }>;
    keyMetrics?: { openBlockers: number; activeRisks: number };
    overallStatus?: string;
  };
  raidLog?: {
    items?: Array<{
      id: string;
      type: string;
      status: string;
      severity: string;
    }>;
  };
  backlogSummary?: {
    summary?: { totalItems: number; byStatus: { blocked: number } };
  };
  decisionLog?: {
    decisions?: Array<{
      id: string;
      status: string;
      relatedRaidItems?: string[];
    }>;
  };
}

export function auditCoherence(artefacts: ArtefactSet): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  // Check 1: Blocker count consistency
  if (artefacts.deliveryState && artefacts.deliveryState.keyMetrics) {
    const reportedBlockers = artefacts.deliveryState.keyMetrics.openBlockers;
    const actualBlockers = artefacts.deliveryState.blockers?.length ?? 0;
    if (reportedBlockers !== actualBlockers) {
      issues.push({
        severity: 'warning',
        artefactType: 'delivery_state',
        field: 'keyMetrics.openBlockers',
        message: `Reported blocker count (${reportedBlockers}) does not match actual blockers list (${actualBlockers})`,
        suggestion: `Update keyMetrics.openBlockers to ${actualBlockers}`,
      });
    }
  }

  // Check 2: Active risks count consistency
  if (artefacts.deliveryState?.keyMetrics && artefacts.raidLog?.items) {
    const reportedRisks = artefacts.deliveryState.keyMetrics.activeRisks;
    const actualRisks = artefacts.raidLog.items.filter(
      (item) =>
        item.type === 'risk' &&
        (item.status === 'open' || item.status === 'mitigating')
    ).length;
    if (reportedRisks !== actualRisks) {
      issues.push({
        severity: 'warning',
        artefactType: 'delivery_state',
        field: 'keyMetrics.activeRisks',
        message: `Reported active risks (${reportedRisks}) does not match RAID log open risks (${actualRisks})`,
        suggestion: `Update keyMetrics.activeRisks to ${actualRisks}`,
      });
    }
  }

  // Check 3: Decision references to RAID items
  if (artefacts.decisionLog?.decisions && artefacts.raidLog?.items) {
    const raidIds = new Set(artefacts.raidLog.items.map((item) => item.id));
    for (const decision of artefacts.decisionLog.decisions) {
      if (decision.relatedRaidItems) {
        for (const raidRef of decision.relatedRaidItems) {
          if (!raidIds.has(raidRef)) {
            issues.push({
              severity: 'info',
              artefactType: 'decision_log',
              field: `decisions[${decision.id}].relatedRaidItems`,
              message: `Decision "${decision.id}" references RAID item "${raidRef}" which does not exist in RAID log`,
              suggestion: `Remove stale reference or add missing RAID item`,
            });
          }
        }
      }
    }
  }

  // Check 4: Blocked items in backlog vs delivery state blockers
  if (
    artefacts.backlogSummary?.summary?.byStatus &&
    artefacts.deliveryState?.blockers
  ) {
    const blockedInBacklog = artefacts.backlogSummary.summary.byStatus.blocked;
    const blockersInDelivery = artefacts.deliveryState.blockers.length;
    if (blockedInBacklog > 0 && blockersInDelivery === 0) {
      issues.push({
        severity: 'warning',
        artefactType: 'delivery_state',
        field: 'blockers',
        message: `Backlog has ${blockedInBacklog} blocked items but delivery state has no blockers listed`,
        suggestion:
          'Review blocked backlog items and add corresponding blockers to delivery state',
      });
    }
  }

  // Check 5: Overall status consistency
  if (artefacts.deliveryState) {
    const status = artefacts.deliveryState.overallStatus;
    const hasBlockers = (artefacts.deliveryState.blockers?.length ?? 0) > 0;
    const hasCriticalRaid = artefacts.raidLog?.items?.some(
      (item) =>
        item.severity === 'critical' &&
        (item.status === 'open' || item.status === 'mitigating')
    );
    if (status === 'green' && (hasBlockers || hasCriticalRaid)) {
      issues.push({
        severity: 'warning',
        artefactType: 'delivery_state',
        field: 'overallStatus',
        message: `Overall status is "green" but there are ${hasBlockers ? 'open blockers' : ''}${hasBlockers && hasCriticalRaid ? ' and ' : ''}${hasCriticalRaid ? 'critical RAID items' : ''}`,
        suggestion: 'Consider changing overall status to "amber" or "red"',
      });
    }
  }

  return issues.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
