/**
 * Tests for GET /api/escalations and HEAD /api/escalations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetByProject = vi.fn();
const mockGetPending = vi.fn();
const mockGetRecentDecided = vi.fn();
const mockCountPending = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories/escalation', () => ({
  EscalationRepository: vi.fn().mockImplementation(function () {
    return {
      getByProject: mockGetByProject,
      getPending: mockGetPending,
      getRecentDecided: mockGetRecentDecided,
      countPending: mockCountPending,
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

import { GET, HEAD } from '../route';

// ============================================================================
// Helpers
// ============================================================================

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
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
  options: [],
  status: 'pending',
  createdAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/escalations
// ============================================================================

describe('GET /api/escalations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/escalations');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns pending escalations by default', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockResolvedValueOnce({
      items: [MOCK_ESCALATION],
    });

    const request = createRequest('http://localhost:3000/api/escalations');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalations).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.escalations[0].id).toBe('esc-1');
    expect(mockGetPending).toHaveBeenCalledWith({ limit: 20 });
  });

  it('filters by projectId when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByProject.mockResolvedValueOnce({
      items: [MOCK_ESCALATION],
    });

    const request = createRequest(
      'http://localhost:3000/api/escalations?projectId=proj-1'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalations).toHaveLength(1);
    expect(mockGetByProject).toHaveBeenCalledWith('proj-1', {
      status: undefined,
      limit: 20,
    });
  });

  it('filters by status=decided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const decidedEscalation = { ...MOCK_ESCALATION, status: 'decided' };
    mockGetRecentDecided.mockResolvedValueOnce({
      items: [decidedEscalation],
    });

    const request = createRequest(
      'http://localhost:3000/api/escalations?status=decided'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalations).toHaveLength(1);
    expect(mockGetRecentDecided).toHaveBeenCalledWith({ limit: 20 });
  });

  it('returns empty array for unsupported statuses', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/escalations?status=expired'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalations).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('respects custom limit parameter', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const request = createRequest(
      'http://localhost:3000/api/escalations?limit=5'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetPending).toHaveBeenCalledWith({ limit: 5 });
  });

  it('caps limit at 100', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const request = createRequest(
      'http://localhost:3000/api/escalations?limit=500'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetPending).toHaveBeenCalledWith({ limit: 100 });
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/escalations');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch escalations');
  });
});

// ============================================================================
// Tests — HEAD /api/escalations
// ============================================================================

describe('HEAD /api/escalations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const response = await HEAD();

    expect(response.status).toBe(401);
  });

  it('returns pending count in header', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCountPending.mockResolvedValueOnce(7);

    const response = await HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Pending-Count')).toBe('7');
  });

  it('returns zero pending count when none exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCountPending.mockResolvedValueOnce(0);

    const response = await HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Pending-Count')).toBe('0');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCountPending.mockRejectedValueOnce(new Error('Count failed'));

    const response = await HEAD();

    expect(response.status).toBe(500);
  });
});
