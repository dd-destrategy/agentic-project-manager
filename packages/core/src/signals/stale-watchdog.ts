/**
 * Stale Item Watchdog
 *
 * Scans artefacts for stale items and generates warnings.
 * Runs deterministically (no LLM cost).
 */

import type {
  ArtefactType,
  RaidItem,
  Decision,
  Blocker,
} from '../types/index.js';

export interface StaleItemWarning {
  artefactType: ArtefactType;
  itemId: string;
  itemTitle: string;
  staleSince: string;
  daysSinceReview: number;
  severity: 'info' | 'warning' | 'critical';
  reason: string;
}

/** Thresholds in days */
const STALE_THRESHOLDS = {
  raidItem: { warning: 14, critical: 30 },
  blocker: { warning: 7, critical: 14 },
  decision: { warning: 30, critical: 60 },
} as const;

export function detectStaleItems(
  artefacts: Array<{ type: ArtefactType; content: unknown }>,
  now?: Date
): StaleItemWarning[] {
  const warnings: StaleItemWarning[] = [];
  const currentDate = now ?? new Date();

  for (const artefact of artefacts) {
    if (artefact.type === 'raid_log') {
      // Check RAID items - use lastReviewed field
      const content = artefact.content as { items?: RaidItem[] };
      if (content?.items) {
        for (const item of content.items) {
          if (item.status === 'resolved' || item.status === 'closed') continue;
          const daysSince = daysBetween(
            new Date(item.lastReviewed),
            currentDate
          );
          const threshold = STALE_THRESHOLDS.raidItem;
          if (daysSince >= threshold.critical) {
            warnings.push({
              artefactType: 'raid_log',
              itemId: item.id,
              itemTitle: item.title,
              staleSince: item.lastReviewed,
              daysSinceReview: daysSince,
              severity: 'critical',
              reason: `RAID item not reviewed for ${daysSince} days (critical threshold: ${threshold.critical})`,
            });
          } else if (daysSince >= threshold.warning) {
            warnings.push({
              artefactType: 'raid_log',
              itemId: item.id,
              itemTitle: item.title,
              staleSince: item.lastReviewed,
              daysSinceReview: daysSince,
              severity: 'warning',
              reason: `RAID item not reviewed for ${daysSince} days (warning threshold: ${threshold.warning})`,
            });
          }
        }
      }
    }

    if (artefact.type === 'delivery_state') {
      // Check blockers
      const content = artefact.content as { blockers?: Blocker[] };
      if (content?.blockers) {
        for (const blocker of content.blockers) {
          const daysSince = daysBetween(
            new Date(blocker.raisedDate),
            currentDate
          );
          const threshold = STALE_THRESHOLDS.blocker;
          if (daysSince >= threshold.critical) {
            warnings.push({
              artefactType: 'delivery_state',
              itemId: blocker.id,
              itemTitle: blocker.description,
              staleSince: blocker.raisedDate,
              daysSinceReview: daysSince,
              severity: 'critical',
              reason: `Blocker open for ${daysSince} days (critical threshold: ${threshold.critical})`,
            });
          } else if (daysSince >= threshold.warning) {
            warnings.push({
              artefactType: 'delivery_state',
              itemId: blocker.id,
              itemTitle: blocker.description,
              staleSince: blocker.raisedDate,
              daysSinceReview: daysSince,
              severity: 'warning',
              reason: `Blocker open for ${daysSince} days (warning threshold: ${threshold.warning})`,
            });
          }
        }
      }
    }

    if (artefact.type === 'decision_log') {
      // Check decisions not reviewed
      const content = artefact.content as { decisions?: Decision[] };
      if (content?.decisions) {
        for (const decision of content.decisions) {
          if (decision.status !== 'active') continue;
          const daysSince = daysBetween(new Date(decision.date), currentDate);
          const threshold = STALE_THRESHOLDS.decision;
          if (daysSince >= threshold.critical) {
            warnings.push({
              artefactType: 'decision_log',
              itemId: decision.id,
              itemTitle: decision.title,
              staleSince: decision.date,
              daysSinceReview: daysSince,
              severity: 'warning',
              reason: `Active decision not reviewed for ${daysSince} days`,
            });
          }
        }
      }
    }
  }

  return warnings.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
