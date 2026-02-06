/**
 * Tests for GET /api/artefacts/[projectId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetAllForProject = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ArtefactRepository: vi.fn().mockImplementation(function () {
    return {
      getAllForProject: mockGetAllForProject,
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

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function createParams(projectId: string): {
  params: Promise<{ projectId: string }>;
} {
  return { params: Promise.resolve({ projectId }) };
}

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_ARTEFACT = {
  id: 'art-1',
  projectId: 'proj-1',
  type: 'raid_log',
  content: { risks: [], actions: [], issues: [], decisions: [] },
  previousVersion: null,
  version: 1,
  updatedAt: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
};

const MOCK_ARTEFACT_2 = {
  id: 'art-2',
  projectId: 'proj-1',
  type: 'delivery_state',
  content: { status: 'on_track', summary: 'All good' },
  previousVersion: { status: 'at_risk', summary: 'Was at risk' },
  version: 3,
  updatedAt: '2024-01-02T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/artefacts/[projectId]
// ============================================================================

describe('GET /api/artefacts/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns artefacts for project', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([MOCK_ARTEFACT]);

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artefacts).toHaveLength(1);
    expect(body.projectId).toBe('proj-1');
    expect(body.artefacts[0].id).toBe('art-1');
    expect(body.artefacts[0].type).toBe('raid_log');
    expect(body.artefacts[0].version).toBe(1);
    expect(mockGetAllForProject).toHaveBeenCalledWith('proj-1');
  });

  it('serialises content to JSON string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([MOCK_ARTEFACT]);

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Content should be JSON-stringified
    expect(typeof body.artefacts[0].content).toBe('string');
    const parsed = JSON.parse(body.artefacts[0].content);
    expect(parsed.risks).toEqual([]);
  });

  it('serialises previousVersion when present', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([MOCK_ARTEFACT_2]);

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.artefacts[0].previousVersion).toBe('string');
    const parsed = JSON.parse(body.artefacts[0].previousVersion);
    expect(parsed.status).toBe('at_risk');
  });

  it('returns multiple artefacts for a project', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([
      MOCK_ARTEFACT,
      MOCK_ARTEFACT_2,
    ]);

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artefacts).toHaveLength(2);
    expect(body.artefacts[0].type).toBe('raid_log');
    expect(body.artefacts[1].type).toBe('delivery_state');
  });

  it('returns empty list when project has no artefacts', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([]);

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.artefacts).toHaveLength(0);
    expect(body.projectId).toBe('proj-1');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/artefacts/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch artefacts');
  });
});
