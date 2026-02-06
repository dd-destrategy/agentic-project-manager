/**
 * Tests for GET /api/graduation and POST /api/graduation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetAutonomyLevel = vi.fn();
const mockGetSpotCheckStats = vi.fn();
const mockSetAutonomyLevel = vi.fn();
const mockResetSpotCheckStats = vi.fn();
const mockGetByProject = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories/agent-config', () => ({
  AgentConfigRepository: vi.fn().mockImplementation(function () {
    return {
      getAutonomyLevel: mockGetAutonomyLevel,
      getSpotCheckStats: mockGetSpotCheckStats,
      setAutonomyLevel: mockSetAutonomyLevel,
      resetSpotCheckStats: mockResetSpotCheckStats,
    };
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/graduation-state', () => ({
  GraduationStateRepository: vi.fn().mockImplementation(function () {
    return {
      getByProject: mockGetByProject,
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

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_SPOT_CHECK_STATS = {
  totalChecks: 10,
  correctCount: 9,
  incorrectCount: 1,
  accuracyRate: 0.9,
  lastCheckAt: '2024-01-01T00:00:00Z',
};

const MOCK_ACTION_STATES = [
  {
    actionType: 'email_stakeholder' as const,
    consecutiveApprovals: 6,
    tier: 'confident' as const,
    lastApprovalAt: '2024-01-01T00:00:00Z',
    lastCancellationAt: undefined,
  },
  {
    actionType: 'jira_status_change' as const,
    consecutiveApprovals: 8,
    tier: 'confident' as const,
    lastApprovalAt: '2024-01-01T00:00:00Z',
    lastCancellationAt: undefined,
  },
];

// ============================================================================
// Tests — GET /api/graduation
// ============================================================================

describe('GET /api/graduation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns graduation evidence when authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce(MOCK_ACTION_STATES);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentLevel).toBe(1);
    expect(body.targetLevel).toBe(2);
    expect(body.actionStates).toHaveLength(2);
    expect(body.spotCheckStats).toBeDefined();
    expect(body.spotCheckStats.totalChecks).toBe(10);
    expect(body.spotCheckStats.accuracyRate).toBe(0.9);
    expect(body.graduationRequirements).toBeDefined();
    expect(body.graduationRequirements.minApprovals).toBe(5);
    expect(body.graduationRequirements.minAccuracyRate).toBe(0.9);
  });

  it('calculates canGraduate as true when all requirements met', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce(MOCK_ACTION_STATES);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canGraduate).toBe(true);
    expect(body.blockers).toHaveLength(0);
  });

  it('reports blockers when approvals are insufficient', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce([
      {
        ...MOCK_ACTION_STATES[0],
        consecutiveApprovals: 2,
      },
      MOCK_ACTION_STATES[1],
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canGraduate).toBe(false);
    expect(body.blockers.length).toBeGreaterThan(0);
    expect(body.blockers).toContain('Need 3 more consecutive approvals');
  });

  it('reports blockers when accuracy rate is too low', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce({
      ...MOCK_SPOT_CHECK_STATS,
      accuracyRate: 0.5,
    });
    mockGetByProject.mockResolvedValueOnce(MOCK_ACTION_STATES);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canGraduate).toBe(false);
    expect(body.blockers).toContain('Spot check accuracy below 90%');
  });

  it('reports blocker when already at max level', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('tactical');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce(MOCK_ACTION_STATES);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentLevel).toBe(3);
    expect(body.targetLevel).toBe(3);
    expect(body.canGraduate).toBe(false);
    expect(body.blockers).toContain('Already at maximum autonomy level');
  });

  it('reports blocker for recent cancellation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce([
      {
        ...MOCK_ACTION_STATES[0],
        lastCancellationAt: new Date().toISOString(),
      },
      MOCK_ACTION_STATES[1],
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canGraduate).toBe(false);
    expect(body.blockers).toContain(
      'Recent action cancellation within last 7 days'
    );
  });

  it('calculates daysSinceLastCheck correctly', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce(MOCK_ACTION_STATES);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.spotCheckStats.daysSinceLastCheck).toBe('number');
    expect(body.spotCheckStats.daysSinceLastCheck).toBeGreaterThanOrEqual(0);
  });

  it('returns null for daysSinceLastCheck when no checks done', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce({
      ...MOCK_SPOT_CHECK_STATS,
      lastCheckAt: null,
    });
    mockGetByProject.mockResolvedValueOnce(MOCK_ACTION_STATES);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spotCheckStats.daysSinceLastCheck).toBeNull();
  });

  it('handles empty action states', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockGetSpotCheckStats.mockResolvedValueOnce(MOCK_SPOT_CHECK_STATS);
    mockGetByProject.mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actionStates).toHaveLength(0);
    expect(body.graduationRequirements.currentApprovals).toBe(0);
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockRejectedValueOnce(new Error('DB failure'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch graduation evidence');
  });
});

// ============================================================================
// Tests — POST /api/graduation
// ============================================================================

describe('POST /api/graduation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({ targetLevel: 2 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('graduates to a higher level successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('monitoring');
    mockSetAutonomyLevel.mockResolvedValueOnce(undefined);
    mockResetSpotCheckStats.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({ targetLevel: 2 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.newLevel).toBe('artefact');
    expect(mockSetAutonomyLevel).toHaveBeenCalledWith('artefact');
    expect(mockResetSpotCheckStats).toHaveBeenCalledOnce();
  });

  it('graduates from artefact to tactical', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('artefact');
    mockSetAutonomyLevel.mockResolvedValueOnce(undefined);
    mockResetSpotCheckStats.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({ targetLevel: 3 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.newLevel).toBe('tactical');
    expect(mockSetAutonomyLevel).toHaveBeenCalledWith('tactical');
  });

  it('returns 400 when targetLevel is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({ targetLevel: 5 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid graduation request');
  });

  it('returns 400 when targetLevel is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid graduation request');
  });

  it('returns 400 when trying to graduate to same or lower level', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockResolvedValueOnce('artefact');

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({ targetLevel: 2 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      'Cannot graduate to a level at or below current level'
    );
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomyLevel.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/graduation', {
      method: 'POST',
      body: JSON.stringify({ targetLevel: 2 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to confirm graduation');
  });
});
