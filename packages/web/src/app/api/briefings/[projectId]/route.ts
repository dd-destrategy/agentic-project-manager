import {
  ArtefactRepository,
  EventRepository,
  EscalationRepository,
  HeldActionRepository,
} from '@agentic-pm/core/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { getDbClient } from '@/lib/db';

/**
 * GET /api/briefings/[projectId]
 *
 * Returns the latest briefing for a project, generated on-the-fly
 * from current artefact data.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { projectId } = await params;
  const briefing = await generateBriefing(projectId);
  return NextResponse.json(briefing);
}

/**
 * POST /api/briefings/[projectId]
 *
 * Generates a new briefing for a specific meeting type.
 * Body: { meetingType: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { projectId } = await params;
  const body = await req.json();
  const meetingType = body.meetingType ?? 'standup';

  const briefing = await generateBriefing(projectId, meetingType);
  return NextResponse.json(briefing);
}

/**
 * Generate a briefing document from current project data.
 *
 * This is deterministic (no LLM) — it pulls data from artefacts
 * and recent events to construct structured sections.
 */
async function generateBriefing(projectId: string, meetingType = 'standup') {
  const db = getDbClient();
  const artefactRepo = new ArtefactRepository(db);
  const eventRepo = new EventRepository(db);
  const escalationRepo = new EscalationRepository(db);
  const heldActionRepo = new HeldActionRepository(db);

  const [artefacts, pendingEscalations, pendingActions] = await Promise.all([
    artefactRepo.getAllForProject(projectId),
    escalationRepo.getByProject(projectId, { status: 'pending' }),
    heldActionRepo.getByProject(projectId, { status: 'pending' }),
  ]);

  // Get recent events
  const today = new Date().toISOString().split('T')[0]!;
  const eventsResult = await eventRepo.getByDate(today, { limit: 50 });
  const projectEvents = eventsResult.items.filter(
    (e) => e.projectId === projectId
  );

  const sections: Array<{
    heading: string;
    content: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  // Section 1: Project Status
  const deliveryState = artefacts.find((a) => a.type === 'delivery_state');
  if (deliveryState) {
    const content =
      typeof deliveryState.content === 'string'
        ? JSON.parse(deliveryState.content)
        : deliveryState.content;
    const status = content?.overallStatus ?? 'unknown';
    const summary = content?.statusSummary ?? 'No status summary available';
    const sprintInfo = content?.currentSprint
      ? `\nCurrent Sprint: ${content.currentSprint.name} — ${content.currentSprint.goal}`
      : '';
    sections.push({
      heading: 'Project Status',
      content: `Overall: ${status.toUpperCase()}${sprintInfo}\n${summary}`,
      priority:
        status === 'red' ? 'high' : status === 'amber' ? 'medium' : 'low',
    });
  }

  // Section 2: Blockers
  if (deliveryState) {
    const content =
      typeof deliveryState.content === 'string'
        ? JSON.parse(deliveryState.content)
        : deliveryState.content;
    const blockers = content?.blockers ?? [];
    if (blockers.length > 0) {
      const blockerText = blockers
        .map(
          (b: { id: string; description: string; severity: string }) =>
            `• [${b.severity.toUpperCase()}] ${b.id}: ${b.description}`
        )
        .join('\n');
      sections.push({
        heading: `Blockers (${blockers.length})`,
        content: blockerText,
        priority: 'high',
      });
    }
  }

  // Section 3: Key Risks & Issues
  const raidLog = artefacts.find((a) => a.type === 'raid_log');
  if (raidLog) {
    const content =
      typeof raidLog.content === 'string'
        ? JSON.parse(raidLog.content)
        : raidLog.content;
    const openItems = (content?.items ?? []).filter(
      (item: { status: string }) =>
        item.status === 'open' || item.status === 'mitigating'
    );
    if (openItems.length > 0) {
      const itemText = openItems
        .slice(0, 5)
        .map(
          (item: {
            type: string;
            severity: string;
            id: string;
            title: string;
          }) =>
            `• [${item.type.toUpperCase()}/${item.severity}] ${item.id}: ${item.title}`
        )
        .join('\n');
      sections.push({
        heading: `Risks & Issues (${openItems.length} open)`,
        content:
          itemText +
          (openItems.length > 5
            ? `\n... and ${openItems.length - 5} more`
            : ''),
        priority: openItems.some(
          (i: { severity: string }) => i.severity === 'critical'
        )
          ? 'high'
          : 'medium',
      });
    }
  }

  // Section 4: Pending Decisions
  if (pendingEscalations.items.length > 0) {
    const escalationText = pendingEscalations.items
      .slice(0, 3)
      .map((e) => `• ${e.title}`)
      .join('\n');
    sections.push({
      heading: `Decisions Pending (${pendingEscalations.items.length})`,
      content: escalationText,
      priority: 'high',
    });
  }

  // Section 5: Held Actions
  if (pendingActions.items.length > 0) {
    const actionText = pendingActions.items
      .slice(0, 3)
      .map(
        (a) =>
          `• [${a.actionType}] Held until ${new Date(a.heldUntil).toLocaleTimeString()}`
      )
      .join('\n');
    sections.push({
      heading: `Held Actions (${pendingActions.items.length})`,
      content: actionText,
      priority: 'medium',
    });
  }

  // Section 6: Recent Activity
  if (projectEvents.length > 0) {
    const activityText = projectEvents
      .slice(0, 5)
      .map((e) => `• [${e.severity}] ${e.summary}`)
      .join('\n');
    sections.push({
      heading: `Recent Activity (${projectEvents.length} events today)`,
      content: activityText,
      priority: 'low',
    });
  }

  return {
    id: `briefing-${projectId}-${Date.now()}`,
    projectId,
    meetingType,
    title: `${meetingType.charAt(0).toUpperCase() + meetingType.slice(1).replace('_', ' ')} Briefing`,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
