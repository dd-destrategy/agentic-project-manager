/**
 * Tests for GET/POST /api/reports/[projectId]/[reportId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetById = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/reports', () => ({
  StatusReportRepository: vi.fn().mockImplementation(function () {
    return { getById: mockGetById, updateStatus: mockUpdateStatus };
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

const PARAMS = {
  params: Promise.resolve({ projectId: 'proj-1', reportId: 'rpt-1' }),
};

const MOCK_REPORT = {
  id: 'rpt-1',
  projectId: 'proj-1',
  template: 'executive',
  status: 'draft',
  sections: [{ heading: 'Summary', content: 'Project on track' }],
  createdAt: '2025-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/reports/[projectId]/[reportId]
// ============================================================================

describe('GET /api/reports/[projectId]/[reportId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/reports/proj-1/rpt-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns specific report', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_REPORT);

    const request = createRequest('/api/reports/proj-1/rpt-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.id).toBe('rpt-1');
    expect(body.report.template).toBe('executive');
    expect(body.report.sections).toHaveLength(1);
    expect(mockGetById).toHaveBeenCalledWith('proj-1', 'rpt-1');
  });

  it('returns 404 when not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest('/api/reports/proj-1/rpt-999');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Report not found');
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ============================================================================
// Tests — POST /api/reports/[projectId]/[reportId]
// ============================================================================

describe('POST /api/reports/[projectId]/[reportId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/reports/proj-1/rpt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'send', recipients: ['a@b.com'] }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns 400 for invalid action', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/reports/proj-1/rpt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'archive', recipients: ['a@b.com'] }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid action. Supported actions: send');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns 400 when no recipients', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/reports/proj-1/rpt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'send', recipients: [] }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('At least one recipient is required');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns 404 when report not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest('/api/reports/proj-1/rpt-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'send', recipients: ['a@b.com'] }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Report not found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('sends report successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_REPORT);
    mockUpdateStatus.mockResolvedValueOnce(undefined);

    const request = createRequest('/api/reports/proj-1/rpt-1', {
      method: 'POST',
      body: JSON.stringify({
        action: 'send',
        recipients: ['alice@example.com', 'bob@example.com'],
      }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sentAt).toBeDefined();
    expect(body.sentTo).toEqual(['alice@example.com', 'bob@example.com']);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'proj-1',
      'rpt-1',
      'sent',
      expect.objectContaining({
        sentAt: expect.any(String),
        sentTo: ['alice@example.com', 'bob@example.com'],
      })
    );
  });
});
