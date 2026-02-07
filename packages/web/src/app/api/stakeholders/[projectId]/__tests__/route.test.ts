/**
 * Tests for GET /api/stakeholders/[projectId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetAllForProject = vi.fn();
const mockGetEngagementAnomalies = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  StakeholderRepository: vi.fn().mockImplementation(function () {
    return {
      getAllForProject: mockGetAllForProject,
      getEngagementAnomalies: mockGetEngagementAnomalies,
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
// Tests — GET /api/stakeholders/[projectId]
// ============================================================================

describe('GET /api/stakeholders/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/stakeholders/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns stakeholders and anomalies', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([
      { id: 'sh-1', name: 'Alice', role: 'Sponsor', influence: 'high' },
      { id: 'sh-2', name: 'Bob', role: 'Tech Lead', influence: 'medium' },
    ]);
    mockGetEngagementAnomalies.mockResolvedValueOnce([
      {
        stakeholderId: 'sh-1',
        anomalyType: 'disengaged',
        description: 'No response in 14 days',
      },
    ]);

    const request = createRequest('/api/stakeholders/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stakeholders).toHaveLength(2);
    expect(body.stakeholders[0].name).toBe('Alice');
    expect(body.stakeholders[1].name).toBe('Bob');
    expect(body.anomalies).toHaveLength(1);
    expect(body.anomalies[0].anomalyType).toBe('disengaged');
    expect(body.count).toBe(2);
    expect(mockGetAllForProject).toHaveBeenCalledWith('proj-1');
    expect(mockGetEngagementAnomalies).toHaveBeenCalledWith('proj-1');
  });

  it('returns empty arrays', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([]);
    mockGetEngagementAnomalies.mockResolvedValueOnce([]);

    const request = createRequest('/api/stakeholders/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stakeholders).toEqual([]);
    expect(body.anomalies).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns 500 on error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('/api/stakeholders/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch stakeholders');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
