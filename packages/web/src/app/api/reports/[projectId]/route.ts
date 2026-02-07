/**
 * GET /api/reports/[projectId] — List reports for a project
 * POST /api/reports/[projectId] — Generate a new report
 */

import { ArtefactRepository } from '@agentic-pm/core/db/repositories';
import { StatusReportGenerator, StatusReportRepository } from '@agentic-pm/core/reports';
import type { ReportTemplate } from '@agentic-pm/core/reports';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, badRequest, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';

const VALID_TEMPLATES: ReportTemplate[] = ['executive', 'team', 'steering_committee'];

/**
 * GET — List reports for a project
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    const { projectId } = await params;
    if (!projectId) return badRequest('Project ID is required');

    const db = getDbClient();
    const reportRepo = new StatusReportRepository(db);
    const reports = await reportRepo.getByProject(projectId);

    return NextResponse.json({ reports, projectId });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return internalError('Failed to fetch reports');
  }
}

/**
 * POST — Generate a new report
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    const { projectId } = await params;
    if (!projectId) return badRequest('Project ID is required');

    const body = await request.json();
    const template = body.template as ReportTemplate;

    if (!template || !VALID_TEMPLATES.includes(template)) {
      return badRequest(
        `Invalid template. Must be one of: ${VALID_TEMPLATES.join(', ')}`
      );
    }

    const db = getDbClient();
    const artefactRepo = new ArtefactRepository(db);
    const reportRepo = new StatusReportRepository(db);

    // Fetch all artefacts for the project
    const artefacts = await artefactRepo.getAllForProject(projectId);
    const artefactMap: Record<string, typeof artefacts[number]> = {};
    for (const artefact of artefacts) {
      artefactMap[artefact.type] = artefact;
    }

    // Generate the report
    const generator = new StatusReportGenerator();
    const report = generator.generateReport(projectId, template, {
      delivery_state: artefactMap['delivery_state'],
      raid_log: artefactMap['raid_log'],
      backlog_summary: artefactMap['backlog_summary'],
      decision_log: artefactMap['decision_log'],
    });

    // Save to DynamoDB
    await reportRepo.create(report);

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error('Error generating report:', error);
    return internalError('Failed to generate report');
  }
}
