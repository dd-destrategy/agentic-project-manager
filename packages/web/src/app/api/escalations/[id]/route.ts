import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { decideEscalationSchema } from '@/schemas/api';
import type { Escalation } from '@/types';

/**
 * GET /api/escalations/[id]
 *
 * Returns a specific escalation by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    // TODO: Replace with real DynamoDB query
    // For now, return mock data for frontend development
    const mockEscalation: Escalation | null =
      id === 'esc-1'
        ? {
            id: 'esc-1',
            projectId: 'proj-1',
            title: 'Sprint scope change requires stakeholder approval',
            context: {
              summary:
                'The product owner has added 3 new high-priority items to the current sprint, pushing total story points from 34 to 47. This exceeds team capacity by 38%.',
              triggeringSignals: [
                {
                  source: 'jira',
                  type: 'sprint_scope_changed',
                  summary: 'Sprint backlog increased from 34 to 47 points',
                  timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                },
              ],
              relevantArtefacts: [
                {
                  artefactType: 'delivery_state',
                  excerpt: 'Current sprint velocity average: 32 points',
                },
              ],
              precedents: [
                'Similar scope increase in Sprint 12 led to 2 items being deferred',
              ],
            },
            options: [
              {
                id: 'opt-1',
                label: 'Accept scope increase',
                description: 'Proceed with the expanded scope and adjust expectations',
                pros: [
                  'Addresses urgent business priorities',
                  'Shows flexibility to stakeholders',
                ],
                cons: [
                  'High risk of sprint failure',
                  'Team may experience burnout',
                  'Quality may suffer',
                ],
                riskLevel: 'high',
              },
              {
                id: 'opt-2',
                label: 'Negotiate scope reduction',
                description: 'Work with PO to defer lower priority items to next sprint',
                pros: [
                  'Maintains sustainable pace',
                  'Protects sprint commitment',
                  'Better for team morale',
                ],
                cons: [
                  'Some features delayed',
                  'Requires difficult conversation with PO',
                ],
                riskLevel: 'low',
              },
              {
                id: 'opt-3',
                label: 'Split the sprint',
                description: 'Complete original scope, then start mini-sprint for new items',
                pros: ['Honours original commitment', 'Addresses new priorities'],
                cons: [
                  'Additional planning overhead',
                  'Complicates metrics tracking',
                ],
                riskLevel: 'medium',
              },
            ],
            agentRecommendation: 'opt-2',
            agentRationale:
              'Based on historical data, the team has never successfully completed a sprint with more than 40 story points. Negotiating scope reduction protects the sprint commitment while still allowing discussion of priority trade-offs.',
            status: 'pending',
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          }
        : id === 'esc-2'
          ? {
              id: 'esc-2',
              projectId: 'proj-1',
              title: 'Critical dependency blocked for 5 days',
              context: {
                summary:
                  'The API integration with the payment provider has been blocked awaiting security review. This is now on the critical path for the release.',
                triggeringSignals: [
                  {
                    source: 'jira',
                    type: 'ticket_status_changed',
                    summary: 'PROJ-234 has been "Blocked" for 5 days',
                    timestamp: new Date(
                      Date.now() - 5 * 24 * 60 * 60 * 1000
                    ).toISOString(),
                  },
                ],
                relevantArtefacts: [
                  {
                    artefactType: 'raid_log',
                    excerpt: 'Risk R-12: Third-party dependency delays (Status: Open)',
                  },
                ],
              },
              options: [
                {
                  id: 'opt-1',
                  label: 'Escalate to leadership',
                  description:
                    'Raise with engineering leadership to expedite security review',
                  pros: ['May unblock quickly', 'Visibility to leadership'],
                  cons: [
                    'Uses escalation capital',
                    'May create friction with security team',
                  ],
                  riskLevel: 'medium',
                },
                {
                  id: 'opt-2',
                  label: 'Implement mock integration',
                  description: 'Build mock service to allow parallel development',
                  pros: ['Unblocks dependent work', 'No external dependencies'],
                  cons: [
                    'Additional development effort',
                    'Risk of integration issues later',
                  ],
                  riskLevel: 'medium',
                },
              ],
              agentRecommendation: 'opt-1',
              agentRationale:
                'Given the 5-day delay and critical path impact, escalation is warranted. The mock integration approach would add 3-4 days of work and still leave integration risk.',
              status: 'pending',
              createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            }
          : null;

    if (!mockEscalation) {
      return NextResponse.json({ error: 'Escalation not found' }, { status: 404 });
    }

    return NextResponse.json(mockEscalation);
  } catch (error) {
    console.error('Error fetching escalation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch escalation' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/escalations/[id]
 *
 * Record a decision on an escalation.
 * Body:
 * - decision: string (option ID selected)
 * - notes?: string (optional user notes)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const result = decideEscalationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const { decision, notes } = result.data;

    // TODO: Replace with real DynamoDB update
    // For now, return mock updated escalation
    const updatedEscalation: Escalation = {
      id,
      projectId: 'proj-1',
      title: 'Sprint scope change requires stakeholder approval',
      context: {
        summary:
          'The product owner has added 3 new high-priority items to the current sprint.',
        triggeringSignals: [
          {
            source: 'jira',
            type: 'sprint_scope_changed',
            summary: 'Sprint backlog increased from 34 to 47 points',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      options: [],
      status: 'decided',
      userDecision: decision,
      userNotes: notes,
      decidedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    };

    return NextResponse.json(updatedEscalation);
  } catch (error) {
    console.error('Error recording decision:', error);
    return NextResponse.json(
      { error: 'Failed to record decision' },
      { status: 500 }
    );
  }
}
