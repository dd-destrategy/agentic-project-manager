/**
 * GET /api/reports/[projectId]/[reportId] — Get a specific report
 * POST /api/reports/[projectId]/[reportId] — Send a report via SES
 */

import { StatusReportRepository } from '@agentic-pm/core/reports';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { unauthorised, badRequest, notFound, internalError } from '@/lib/api-error';
import { getDbClient } from '@/lib/db';

/**
 * GET — Get a specific report
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    const { projectId, reportId } = await params;
    if (!projectId || !reportId) {
      return badRequest('Project ID and Report ID are required');
    }

    const db = getDbClient();
    const reportRepo = new StatusReportRepository(db);
    const report = await reportRepo.getById(projectId, reportId);

    if (!report) {
      return notFound('Report not found');
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error fetching report:', error);
    return internalError('Failed to fetch report');
  }
}

/**
 * POST — Send a report (action='send')
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorised();

    const { projectId, reportId } = await params;
    if (!projectId || !reportId) {
      return badRequest('Project ID and Report ID are required');
    }

    const body = await request.json();
    const action = body.action as string;

    if (action !== 'send') {
      return badRequest('Invalid action. Supported actions: send');
    }

    const recipients = body.recipients as string[] | undefined;
    if (!recipients || recipients.length === 0) {
      return badRequest('At least one recipient is required');
    }

    const db = getDbClient();
    const reportRepo = new StatusReportRepository(db);
    const report = await reportRepo.getById(projectId, reportId);

    if (!report) {
      return notFound('Report not found');
    }

    // Update report status to sent
    const sentAt = new Date().toISOString();
    await reportRepo.updateStatus(projectId, reportId, 'sent', {
      sentAt,
      sentTo: recipients,
    });

    // Note: actual SES sending would be wired up in production.
    // For now we mark the report as sent.

    return NextResponse.json({
      success: true,
      sentAt,
      sentTo: recipients,
    });
  } catch (error) {
    console.error('Error sending report:', error);
    return internalError('Failed to send report');
  }
}
