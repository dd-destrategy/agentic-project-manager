/**
 * Tests for GET/POST /api/reports/[projectId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetByProject = vi.fn();
const mockCreate = vi.fn();
const mockGenerateReport = vi.fn();
const mockGetAllForProject = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ArtefactRepository: vi.fn().mockImplementation(function () {
    return { getAllForProject: mockGetAllForProject };
  }),
}));

vi.mock('@agentic-pm/core/reports', () => ({
  StatusReportGenerator: vi.fn().mockImplementation(function () {
    return { generateReport: mockGenerateReport };
  }),
  StatusReportRepository: vi.fn().mockImplementation(function () {
    return { getByProject: mockGetByProject, create: mockCreate };
  }),
}));

const mockGetServerSession = vi.fn();
vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock('@/app/api/auth/[...nextauth]/auth-options', () => ({
  authOptions: { providers: [] },
}));

// ============================================================================
// Import handler under test
// ============================================================================

import { GET, POST } from '../route';

// ============================================================================
// Helpers
// ============================================================================

function createRequest(
  url: string,
  init?: Record<string, unknown>
): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init as never);
}

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const PARAMS = { params: Promise.resolve({ projectId: 'proj-1' }) };

// ============================================================================
// Tests — GET /api/reports/[projectId]
// ============================================================================

describe('GET /api/reports/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/reports/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns reports for project', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const mockReports = [
      {
        id: 'rpt-1',
        projectId: 'proj-1',
        template: 'executive',
        status: 'draft',
      },
      { id: 'rpt-2', projectId: 'proj-1', template: 'team', status: 'sent' },
    ];
    mockGetByProject.mockResolvedValueOnce(mockReports);

    const request = createRequest('/api/reports/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reports).toHaveLength(2);
    expect(body.reports[0].id).toBe('rpt-1');
    expect(body.reports[1].id).toBe('rpt-2');
    expect(body.projectId).toBe('proj-1');
    expect(mockGetByProject).toHaveBeenCalledWith('proj-1');
  });
});

// ============================================================================
// Tests — POST /api/reports/[projectId]
// ============================================================================

describe('POST /api/reports/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/reports/proj-1', {
      method: 'POST',
      body: JSON.stringify({ template: 'executive' }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('generates report with valid template', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([
      { type: 'delivery_state', content: { overallStatus: 'green' } },
      { type: 'raid_log', content: { items: [] } },
    ]);
    const mockReport = {
      id: 'rpt-new',
      projectId: 'proj-1',
      template: 'executive',
      sections: [{ heading: 'Summary', content: 'All good' }],
    };
    mockGenerateReport.mockReturnValueOnce(mockReport);
    mockCreate.mockResolvedValueOnce(undefined);

    const request = createRequest('/api/reports/proj-1', {
      method: 'POST',
      body: JSON.stringify({ template: 'executive' }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.report.id).toBe('rpt-new');
    expect(body.report.template).toBe('executive');
    expect(mockGenerateReport).toHaveBeenCalledWith(
      'proj-1',
      'executive',
      expect.objectContaining({
        delivery_state: expect.objectContaining({ type: 'delivery_state' }),
        raid_log: expect.objectContaining({ type: 'raid_log' }),
      })
    );
    expect(mockCreate).toHaveBeenCalledWith(mockReport);
  });

  it('returns 400 for invalid template', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/reports/proj-1', {
      method: 'POST',
      body: JSON.stringify({ template: 'invalid_template' }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid template');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns 500 on error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('/api/reports/proj-1', {
      method: 'POST',
      body: JSON.stringify({ template: 'executive' }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to generate report');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
