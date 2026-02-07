/**
 * Housekeeping Lambda
 *
 * Daily maintenance tasks: storage check, budget summary, digest email.
 * Runs once per day (first cycle after configured digest time, default 8am).
 */

import {
  DynamoDBClient,
  ProjectRepository,
  EventRepository,
  AgentConfigRepository,
  ArtefactRepository,
  EscalationRepository,
  HeldActionRepository,
  CONFIG_KEYS,
} from '@agentic-pm/core/db';
import { SESClient } from '@agentic-pm/core/integrations';
import type { Project, Event } from '@agentic-pm/core/types';
import type { Context } from 'aws-lambda';

import { logger, getEnv } from '../shared/context.js';
import type { ArtefactUpdateOutput } from '../shared/types.js';

/**
 * Housekeeping output
 */
interface HousekeepingOutput {
  digestSent: boolean;
  digestRecipient?: string;
  storageCheck: {
    totalItems: number;
    expiringItems: number;
  };
  budgetSummary: {
    dailySpendUsd: number;
    monthlySpendUsd: number;
  };
  activitySummary: {
    cyclesRun: number;
    signalsDetected: number;
    actionsTaken: number;
    artefactsUpdated: number;
    escalationsCreated: number;
  };
}

/**
 * Daily digest email content
 */
interface DigestContent {
  date: string;
  projectSummaries: ProjectDigestSummary[];
  activityStats: ActivityStats;
  pendingEscalations: number;
  pendingHeldActions: number;
  budgetStatus: BudgetDigestStatus;
  dashboardUrl: string;
}

interface ProjectDigestSummary {
  name: string;
  healthStatus: 'healthy' | 'warning' | 'error';
  pendingEscalations: number;
  pendingHeldActions: number;
  artefactUpdates: number;
  recentlyChangedArtefacts: string[];
  signalsDetected: number;
}

interface ActivityStats {
  cyclesRun: number;
  signalsDetected: number;
  actionsTaken: number;
  actionsHeld: number;
  artefactsUpdated: number;
  escalationsCreated: number;
  escalationsResolved: number;
}

interface BudgetDigestStatus {
  dailySpendUsd: number;
  dailyLimitUsd: number;
  monthlySpendUsd: number;
  monthlyLimitUsd: number;
}

/**
 * Housekeeping handler
 */
export async function handler(
  _event: ArtefactUpdateOutput,
  context: Context
): Promise<HousekeepingOutput> {
  logger.setContext(context);
  logger.info('Housekeeping started');

  const env = getEnv();

  // Initialize clients
  const db = new DynamoDBClient(undefined, env.TABLE_NAME);
  const projectRepo = new ProjectRepository(db);
  const eventRepo = new EventRepository(db);
  const configRepo = new AgentConfigRepository(db);

  const artefactRepo = new ArtefactRepository(db);
  const escalationRepo = new EscalationRepository(db);
  const heldActionRepo = new HeldActionRepository(db);

  try {
    // 1. Get configuration
    const digestEmail = await configRepo.getValue<string>(
      CONFIG_KEYS.DIGEST_EMAIL
    );
    const dashboardUrl =
      (await configRepo.getValue<string>(CONFIG_KEYS.DASHBOARD_URL)) ??
      'https://agentic-pm.example.com';
    const sesFromAddress =
      process.env.SES_FROM_ADDRESS ?? 'noreply@agentic-pm.example.com';

    // 2. Get all active projects
    const projectsResult = await projectRepo.getActive();
    const projects = projectsResult.items;

    // 3. Get events from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;
    const todayStr = new Date().toISOString().split('T')[0]!;

    const [yesterdayEvents, todayEvents] = await Promise.all([
      eventRepo.getByDate(yesterdayStr, { limit: 1000 }),
      eventRepo.getByDate(todayStr, { limit: 1000 }),
    ]);

    const allEvents = [...yesterdayEvents.items, ...todayEvents.items];

    // 4. Calculate activity statistics
    const activityStats = calculateActivityStats(allEvents);

    // 5. Get real budget status from config repository
    const budgetStatus = await configRepo.getBudgetStatus();

    // 6. Get real pending escalation and held action counts
    const [pendingEscalations, pendingHeldActions] = await Promise.all([
      escalationRepo.countPending(),
      heldActionRepo.countPending(),
    ]);

    // 7. Get artefacts for each project and identify recently changed ones
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const projectArtefacts = await Promise.all(
      projects.map(async (project) => {
        const artefacts = await artefactRepo.getAllForProject(project.id);
        const recentlyChanged = artefacts
          .filter((a) => a.updatedAt > twentyFourHoursAgo)
          .map((a) => a.type);
        return { projectId: project.id, recentlyChanged };
      })
    );
    const artefactChangeMap = new Map(
      projectArtefacts.map((pa) => [pa.projectId, pa.recentlyChanged])
    );

    // 8. Generate project summaries for digest (with real escalation/held-action/artefact data)
    const projectSummaries = await generateProjectSummaries(
      projects,
      allEvents,
      escalationRepo,
      heldActionRepo,
      artefactChangeMap
    );

    // 9. Storage check (simplified - count events)
    const storageCheck = {
      totalItems: allEvents.length,
      expiringItems: 0, // TODO: Check TTL in Phase 2
    };

    const budgetSummary = {
      dailySpendUsd: budgetStatus.dailySpendUsd,
      monthlySpendUsd: budgetStatus.monthlySpendUsd,
    };

    // 10. Send daily digest email if configured
    let digestSent = false;
    if (digestEmail) {
      try {
        const sesClient = new SESClient({
          fromAddress: sesFromAddress,
        });

        const digestContent: DigestContent = {
          date: new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          projectSummaries,
          activityStats,
          pendingEscalations,
          pendingHeldActions,
          budgetStatus: {
            dailySpendUsd: budgetStatus.dailySpendUsd,
            dailyLimitUsd: budgetStatus.dailyLimitUsd,
            monthlySpendUsd: budgetStatus.monthlySpendUsd,
            monthlyLimitUsd: budgetStatus.monthlyLimitUsd,
          },
          dashboardUrl,
        };

        await sendDailyDigest(sesClient, digestEmail, digestContent);
        digestSent = true;

        logger.info('Daily digest sent', { recipient: digestEmail });
      } catch (error) {
        logger.error('Failed to send daily digest', error as Error);
        // Don't fail the entire housekeeping run if email fails
      }
    } else {
      logger.info('No digest email configured, skipping');
    }

    // 11. Detect actions stuck in 'executing' status
    try {
      const stuckActions = await heldActionRepo.getStuckExecuting(5);
      if (stuckActions.length > 0) {
        logger.warn('Detected stuck executing actions', {
          count: stuckActions.length,
          actionIds: stuckActions.map((a) => a.id),
        });

        for (const stuckAction of stuckActions) {
          await eventRepo.create({
            projectId: stuckAction.projectId,
            eventType: 'escalation_created',
            severity: 'warning',
            summary: `Action "${stuckAction.actionType}" stuck in executing state for over 5 minutes`,
            detail: {
              relatedIds: {
                actionId: stuckAction.id,
              },
              context: {
                actionType: stuckAction.actionType,
                claimedAt: stuckAction.claimedAt,
                stuckDetectedAt: new Date().toISOString(),
              },
            },
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check for stuck executing actions', error as Error);
      // Don't fail the entire housekeeping run
    }

    // 12. Mark housekeeping as completed so it doesn't run again today
    await configRepo.updateLastHousekeeping();

    const output: HousekeepingOutput = {
      digestSent,
      digestRecipient: digestEmail ?? undefined,
      storageCheck,
      budgetSummary,
      activitySummary: activityStats,
    };

    logger.info('Housekeeping completed', { ...output });

    return output;
  } catch (error) {
    logger.error('Housekeeping failed', error as Error);
    throw error;
  }
}

/**
 * Calculate activity statistics from events
 */
function calculateActivityStats(events: Event[]): ActivityStats {
  const stats: ActivityStats = {
    cyclesRun: 0,
    signalsDetected: 0,
    actionsTaken: 0,
    actionsHeld: 0,
    artefactsUpdated: 0,
    escalationsCreated: 0,
    escalationsResolved: 0,
  };

  for (const event of events) {
    switch (event.eventType) {
      case 'heartbeat':
      case 'heartbeat_with_changes':
        stats.cyclesRun++;
        break;
      case 'signal_detected':
        stats.signalsDetected++;
        break;
      case 'action_taken':
        stats.actionsTaken++;
        break;
      case 'action_held':
        stats.actionsHeld++;
        break;
      case 'artefact_updated':
        stats.artefactsUpdated++;
        break;
      case 'escalation_created':
        stats.escalationsCreated++;
        break;
      case 'escalation_decided':
        stats.escalationsResolved++;
        break;
    }
  }

  return stats;
}

/**
 * Generate project summaries for the digest using real repository data
 */
async function generateProjectSummaries(
  projects: Project[],
  events: Event[],
  escalationRepo: EscalationRepository,
  heldActionRepo: HeldActionRepository,
  artefactChangeMap: Map<string, string[]>
): Promise<ProjectDigestSummary[]> {
  return Promise.all(
    projects.map(async (project) => {
      const projectEvents = events.filter((e) => e.projectId === project.id);

      const signalsDetected = projectEvents.filter(
        (e) => e.eventType === 'signal_detected'
      ).length;

      const artefactUpdates = projectEvents.filter(
        (e) => e.eventType === 'artefact_updated'
      ).length;

      // Use real counts from repositories
      const [projectPendingEscalations, projectPendingHeldActions] =
        await Promise.all([
          escalationRepo.countPendingByProject(project.id),
          heldActionRepo.countPendingByProject(project.id),
        ]);

      const recentlyChangedArtefacts = artefactChangeMap.get(project.id) ?? [];

      const hasErrors = projectEvents.some(
        (e) => e.severity === 'error' || e.severity === 'critical'
      );

      const hasWarnings = projectEvents.some((e) => e.severity === 'warning');

      // Calculate health status
      let healthStatus: 'healthy' | 'warning' | 'error' = 'healthy';
      if (hasErrors) {
        healthStatus = 'error';
      } else if (hasWarnings || projectPendingEscalations > 0) {
        healthStatus = 'warning';
      }

      return {
        name: project.name,
        healthStatus,
        pendingEscalations: projectPendingEscalations,
        pendingHeldActions: projectPendingHeldActions,
        artefactUpdates,
        recentlyChangedArtefacts,
        signalsDetected,
      };
    })
  );
}

/**
 * Send the daily digest email
 */
async function sendDailyDigest(
  sesClient: SESClient,
  recipient: string,
  content: DigestContent
): Promise<void> {
  const subject = `[Agentic PM] Daily Digest - ${content.date}`;

  // Plain text version
  const bodyText = generateDigestText(content);

  // HTML version
  const bodyHtml = generateDigestHtml(content);

  await sesClient.sendEmail({
    to: [recipient],
    subject,
    bodyText,
    bodyHtml,
  });
}

/**
 * Generate plain text digest content
 */
function generateDigestText(content: DigestContent): string {
  const lines: string[] = [
    'Agentic PM Daily Digest',
    '=======================',
    '',
    `Date: ${content.date}`,
    '',
    '--- Activity Summary (Last 24 Hours) ---',
    '',
    `Agent cycles completed: ${content.activityStats.cyclesRun}`,
    `Signals detected: ${content.activityStats.signalsDetected}`,
    `Actions taken: ${content.activityStats.actionsTaken}`,
    `Actions held for review: ${content.activityStats.actionsHeld}`,
    `Artefacts updated: ${content.activityStats.artefactsUpdated}`,
    `Escalations created: ${content.activityStats.escalationsCreated}`,
    `Escalations resolved: ${content.activityStats.escalationsResolved}`,
    '',
  ];

  if (content.pendingEscalations > 0) {
    lines.push(
      `*** ${content.pendingEscalations} PENDING ESCALATION${content.pendingEscalations !== 1 ? 'S' : ''} NEED YOUR ATTENTION ***`,
      ''
    );
  }

  if (content.pendingHeldActions > 0) {
    lines.push(
      `${content.pendingHeldActions} held action${content.pendingHeldActions !== 1 ? 's' : ''} awaiting review`,
      ''
    );
  }

  lines.push('--- Project Health ---', '');

  for (const project of content.projectSummaries) {
    const statusIcon =
      project.healthStatus === 'healthy'
        ? '[OK]'
        : project.healthStatus === 'warning'
          ? '[!]'
          : '[X]';

    lines.push(`${statusIcon} ${project.name}`);
    lines.push(`    Status: ${project.healthStatus.toUpperCase()}`);
    lines.push(`    Signals: ${project.signalsDetected}`);
    lines.push(`    Artefact updates: ${project.artefactUpdates}`);

    if (project.recentlyChangedArtefacts.length > 0) {
      lines.push(
        `    Recently changed: ${project.recentlyChangedArtefacts.join(', ')}`
      );
    }

    if (project.pendingEscalations > 0) {
      lines.push(`    Pending escalations: ${project.pendingEscalations}`);
    }

    if (project.pendingHeldActions > 0) {
      lines.push(`    Held actions: ${project.pendingHeldActions}`);
    }

    lines.push('');
  }

  if (content.projectSummaries.length === 0) {
    lines.push('No active projects configured.', '');
  }

  lines.push('--- Budget Status ---', '');
  lines.push(
    `Daily: $${content.budgetStatus.dailySpendUsd.toFixed(2)} / $${content.budgetStatus.dailyLimitUsd.toFixed(2)}`
  );
  lines.push(
    `Monthly: $${content.budgetStatus.monthlySpendUsd.toFixed(2)} / $${content.budgetStatus.monthlyLimitUsd.toFixed(2)}`
  );
  lines.push('');
  lines.push('---');
  lines.push(`View dashboard: ${content.dashboardUrl}`);
  lines.push('');
  lines.push('This is an automated message from Agentic PM Workbench.');

  return lines.join('\n');
}

/**
 * Generate HTML digest content
 */
function generateDigestHtml(content: DigestContent): string {
  const healthStatusColors = {
    healthy: '#22c55e',
    warning: '#d97706',
    error: '#dc2626',
  };

  const projectRows = content.projectSummaries
    .map(
      (project) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${escapeHtml(project.name)}</strong>
          ${project.recentlyChangedArtefacts.length > 0 ? `<br><span style="font-size: 11px; color: #6b7280;">Changed: ${project.recentlyChangedArtefacts.map((a) => escapeHtml(a)).join(', ')}</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; background-color: ${healthStatusColors[project.healthStatus]};">
            ${project.healthStatus.toUpperCase()}
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${project.signalsDetected}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${project.artefactUpdates}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          ${project.pendingEscalations > 0 ? `<strong style="color: #d97706;">${project.pendingEscalations}</strong>` : '0'}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          ${project.pendingHeldActions > 0 ? `<strong style="color: #d97706;">${project.pendingHeldActions}</strong>` : '0'}
        </td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agentic PM Daily Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background-color: #1f2937; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; font-size: 24px;">Agentic PM Daily Digest</h1>
      <p style="margin: 8px 0 0; opacity: 0.8;">${escapeHtml(content.date)}</p>
    </div>

    <!-- Content -->
    <div style="background-color: white; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      ${
        content.pendingEscalations > 0
          ? `
        <!-- Escalation Alert -->
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">
            ${content.pendingEscalations} escalation${content.pendingEscalations !== 1 ? 's' : ''} need${content.pendingEscalations === 1 ? 's' : ''} your attention
          </p>
          <a href="${escapeHtml(content.dashboardUrl)}/escalations" style="display: inline-block; margin-top: 12px; padding: 8px 16px; background-color: #d97706; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Now</a>
        </div>
      `
          : ''
      }

      ${
        content.pendingHeldActions > 0
          ? `
        <!-- Held Actions Alert -->
        <div style="background-color: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; color: #1e40af; font-weight: 600;">
            ${content.pendingHeldActions} held action${content.pendingHeldActions !== 1 ? 's' : ''} awaiting review
          </p>
          <a href="${escapeHtml(content.dashboardUrl)}/held-actions" style="display: inline-block; margin-top: 12px; padding: 8px 16px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Actions</a>
        </div>
      `
          : ''
      }

      <!-- Activity Summary -->
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #374151;">Activity Summary (Last 24 Hours)</h2>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1f2937;">${content.activityStats.cyclesRun}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">Cycles</p>
        </div>
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1f2937;">${content.activityStats.signalsDetected}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">Signals</p>
        </div>
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1f2937;">${content.activityStats.actionsTaken}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">Actions</p>
        </div>
      </div>

      <table style="width: 100%; font-size: 14px; color: #6b7280; margin-bottom: 24px;">
        <tr>
          <td>Actions held for review:</td>
          <td style="text-align: right; font-weight: 500; color: #374151;">${content.activityStats.actionsHeld}</td>
        </tr>
        <tr>
          <td>Artefacts updated:</td>
          <td style="text-align: right; font-weight: 500; color: #374151;">${content.activityStats.artefactsUpdated}</td>
        </tr>
        <tr>
          <td>Escalations created:</td>
          <td style="text-align: right; font-weight: 500; color: #374151;">${content.activityStats.escalationsCreated}</td>
        </tr>
        <tr>
          <td>Escalations resolved:</td>
          <td style="text-align: right; font-weight: 500; color: #374151;">${content.activityStats.escalationsResolved}</td>
        </tr>
      </table>

      <!-- Project Health -->
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #374151;">Project Health</h2>
      ${
        content.projectSummaries.length > 0
          ? `
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Project</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Status</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Signals</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Updates</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Escalations</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Held</th>
            </tr>
          </thead>
          <tbody>
            ${projectRows}
          </tbody>
        </table>
      `
          : `
        <p style="color: #6b7280; font-style: italic; margin-bottom: 24px;">No active projects configured.</p>
      `
      }

      <!-- Budget Status -->
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #374151;">Budget Status</h2>
      <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #6b7280;">Daily</span>
            <span style="font-weight: 500;">$${content.budgetStatus.dailySpendUsd.toFixed(2)} / $${content.budgetStatus.dailyLimitUsd.toFixed(2)}</span>
          </div>
          <div style="background-color: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
            <div style="background-color: ${getBudgetColor(content.budgetStatus.dailySpendUsd, content.budgetStatus.dailyLimitUsd)}; height: 100%; width: ${Math.min(100, (content.budgetStatus.dailySpendUsd / content.budgetStatus.dailyLimitUsd) * 100)}%;"></div>
          </div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #6b7280;">Monthly</span>
            <span style="font-weight: 500;">$${content.budgetStatus.monthlySpendUsd.toFixed(2)} / $${content.budgetStatus.monthlyLimitUsd.toFixed(2)}</span>
          </div>
          <div style="background-color: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
            <div style="background-color: ${getBudgetColor(content.budgetStatus.monthlySpendUsd, content.budgetStatus.monthlyLimitUsd)}; height: 100%; width: ${Math.min(100, (content.budgetStatus.monthlySpendUsd / content.budgetStatus.monthlyLimitUsd) * 100)}%;"></div>
          </div>
        </div>
      </div>

      <!-- Dashboard Link -->
      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="${escapeHtml(content.dashboardUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #1f2937; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Open Dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
      <p style="margin: 0;">This is an automated message from Agentic PM Workbench.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get budget progress bar colour based on usage
 */
function getBudgetColor(spent: number, limit: number): string {
  const percentage = (spent / limit) * 100;
  if (percentage >= 90) return '#dc2626'; // red
  if (percentage >= 70) return '#d97706'; // amber
  return '#22c55e'; // green
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
