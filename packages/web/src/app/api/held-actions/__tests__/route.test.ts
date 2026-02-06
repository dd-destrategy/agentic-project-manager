/**
 * Tests for GET /api/held-actions and HEAD /api/held-actions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetByProject = vi.fn();
const mockGetPending = vi.fn();
const mockGetRecentlyExecuted = vi.fn();
const mockCountPending = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/held-action', () => ({
  HeldActionRepository: vi.fn().mockImplementation(function () {
    return {
      getByProject: mockGetByProject,
      getPending: mockGetPending,
      getRecentlyExecuted: mockGetRecentlyExecuted,
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

const MOCK_HELD_ACTION = {
  id: 'ha-1',
  projectId: 'proj-1',
  actionType: 'create_jira_ticket',
  status: 'pending',
  proposedAction: {
    summary: 'Create ticket for issue',
    details: { key: 'TP-123' },
  },
  rationale: 'This action requires approval',
  createdAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/held-actions
// ============================================================================

describe('GET /api/held-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/held-actions');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns pending held actions by default', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockResolvedValueOnce({
      items: [MOCK_HELD_ACTION],
    });

    const request = createRequest('http://localhost:3000/api/held-actions');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.heldActions).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.heldActions[0].id).toBe('ha-1');
    expect(mockGetPending).toHaveBeenCalledWith({ limit: 50 });
  });

  it('filters by projectId when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByProject.mockResolvedValueOnce({
      items: [MOCK_HELD_ACTION],
    });

    const request = createRequest(
      'http://localhost:3000/api/held-actions?projectId=proj-1'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.heldActions).toHaveLength(1);
    expect(mockGetByProject).toHaveBeenCalledWith('proj-1', {
      status: undefined,
      limit: 50,
    });
  });

  it('filters by status=executed', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const executedAction = { ...MOCK_HELD_ACTION, status: 'executed' };
    mockGetRecentlyExecuted.mockResolvedValueOnce({
      items: [executedAction],
    });

    const request = createRequest(
      'http://localhost:3000/api/held-actions?status=executed'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.heldActions).toHaveLength(1);
    expect(mockGetRecentlyExecuted).toHaveBeenCalledWith({ limit: 50 });
  });

  it('returns empty array for unsupported statuses', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions?status=cancelled'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.heldActions).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('respects custom limit parameter', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const request = createRequest(
      'http://localhost:3000/api/held-actions?limit=10'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetPending).toHaveBeenCalledWith({ limit: 10 });
  });

  it('caps limit at 100', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const request = createRequest(
      'http://localhost:3000/api/held-actions?limit=500'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetPending).toHaveBeenCalledWith({ limit: 100 });
  });

  it('filters by projectId and status together', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByProject.mockResolvedValueOnce({
      items: [MOCK_HELD_ACTION],
    });

    const request = createRequest(
      'http://localhost:3000/api/held-actions?projectId=proj-1&status=pending'
    );
    const response = await GET(request);
    await response.json();

    expect(response.status).toBe(200);
    expect(mockGetByProject).toHaveBeenCalledWith('proj-1', {
      status: 'pending',
      limit: 50,
    });
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetPending.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/held-actions');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch held actions');
  });
});

// ============================================================================
// Tests — HEAD /api/held-actions
// ============================================================================

describe('HEAD /api/held-actions', () => {
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
    mockCountPending.mockResolvedValueOnce(5);

    const response = await HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Pending-Count')).toBe('5');
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
