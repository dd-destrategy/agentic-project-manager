/**
 * Tests for GET /api/snapshots/[projectId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetTrend = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ArtefactSnapshotRepository: vi.fn().mockImplementation(function () {
    return { getTrend: mockGetTrend };
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

import { GET } from '../route';

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
// Tests — GET /api/snapshots/[projectId]
// ============================================================================

describe('GET /api/snapshots/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/snapshots/proj-1?type=delivery_state');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns 400 when type param missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/snapshots/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Artefact type is required (query param: type)');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns 400 for invalid artefact type', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/snapshots/proj-1?type=invalid_type');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid artefact type');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns trend data successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const mockTrend = [
      { timestamp: '2025-01-01T00:00:00Z', snapshot: { status: 'green' } },
      { timestamp: '2025-01-02T00:00:00Z', snapshot: { status: 'amber' } },
    ];
    mockGetTrend.mockResolvedValueOnce(mockTrend);

    const request = createRequest('/api/snapshots/proj-1?type=delivery_state');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectId).toBe('proj-1');
    expect(body.artefactType).toBe('delivery_state');
    expect(body.dataPoints).toEqual(mockTrend);
    expect(body.count).toBe(2);
    expect(mockGetTrend).toHaveBeenCalledWith('proj-1', 'delivery_state', {
      limit: 30,
      since: undefined,
    });
  });

  it('respects limit and since params', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetTrend.mockResolvedValueOnce([]);

    const since = '2025-01-01T00:00:00Z';
    const request = createRequest(
      `/api/snapshots/proj-1?type=raid_log&limit=10&since=${since}`
    );
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artefactType).toBe('raid_log');
    expect(body.count).toBe(0);
    expect(mockGetTrend).toHaveBeenCalledWith('proj-1', 'raid_log', {
      limit: 10,
      since,
    });
  });

  it('returns 500 on error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetTrend.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('/api/snapshots/proj-1?type=delivery_state');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch artefact snapshots');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
