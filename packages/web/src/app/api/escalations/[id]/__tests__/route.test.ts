/**
 * Tests for GET /api/escalations/[id] and POST /api/escalations/[id]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetById = vi.fn();
const mockRecordDecision = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  EscalationRepository: vi.fn().mockImplementation(function () {
    return {
      getById: mockGetById,
      recordDecision: mockRecordDecision,
    };
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
// Import handlers under test
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

function createParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_ESCALATION = {
  id: 'esc-1',
  projectId: 'proj-1',
  title: 'Test Escalation',
  context: {
    summary: 'Something needs attention',
    triggeringSignals: [],
  },
  options: [
    { id: 'opt-1', label: 'Approve', description: 'Approve the action' },
    { id: 'opt-2', label: 'Reject', description: 'Reject the action' },
  ],
  status: 'pending',
  createdAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/escalations/[id]
// ============================================================================

describe('GET /api/escalations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1'
    );
    const response = await GET(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns 400 when projectId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1'
    );
    const response = await GET(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('projectId query parameter is required');
  });

  it('returns escalation when found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_ESCALATION);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1'
    );
    const response = await GET(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('esc-1');
    expect(body.title).toBe('Test Escalation');
    expect(mockGetById).toHaveBeenCalledWith('proj-1', 'esc-1');
  });

  it('returns 404 when escalation not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/escalations/nonexistent?projectId=proj-1'
    );
    const response = await GET(request, createParams('nonexistent'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Escalation not found');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1'
    );
    const response = await GET(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch escalation');
  });
});

// ============================================================================
// Tests — POST /api/escalations/[id]
// ============================================================================

describe('POST /api/escalations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1',
      {
        method: 'POST',
        body: JSON.stringify({ decision: 'opt-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns 400 when decision field is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1',
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid escalation decision');
  });

  it('returns 400 when projectId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1',
      {
        method: 'POST',
        body: JSON.stringify({ decision: 'opt-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('projectId query parameter is required');
  });

  it('records decision successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const decidedEscalation = {
      ...MOCK_ESCALATION,
      status: 'decided',
      decision: 'opt-1',
    };
    mockRecordDecision.mockResolvedValueOnce(decidedEscalation);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1',
      {
        method: 'POST',
        body: JSON.stringify({ decision: 'opt-1', notes: 'Looks good' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('decided');
    expect(mockRecordDecision).toHaveBeenCalledWith('proj-1', 'esc-1', {
      userDecision: 'opt-1',
      userNotes: 'Looks good',
    });
  });

  it('records decision without optional notes', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const decidedEscalation = {
      ...MOCK_ESCALATION,
      status: 'decided',
      decision: 'opt-2',
    };
    mockRecordDecision.mockResolvedValueOnce(decidedEscalation);

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1',
      {
        method: 'POST',
        body: JSON.stringify({ decision: 'opt-2' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('decided');
    expect(mockRecordDecision).toHaveBeenCalledWith('proj-1', 'esc-1', {
      userDecision: 'opt-2',
      userNotes: undefined,
    });
  });

  it('returns 404 when escalation not found during decision', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockRecordDecision.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/escalations/nonexistent?projectId=proj-1',
      {
        method: 'POST',
        body: JSON.stringify({ decision: 'opt-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('nonexistent'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Escalation not found');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockRecordDecision.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest(
      'http://localhost:3000/api/escalations/esc-1?projectId=proj-1',
      {
        method: 'POST',
        body: JSON.stringify({ decision: 'opt-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('esc-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to record decision');
  });
});
