/**
 * Tests for GET /api/projects and POST /api/projects
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

// Mock repository methods — declared before vi.mock so the hoisted factories
// can reference them via closure.
const mockGetActive = vi.fn();
const mockCreate = vi.fn();
const mockGetPending = vi.fn();
const mockGetByProject = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories/project', () => ({
  ProjectRepository: vi.fn().mockImplementation(function () {
    return {
      getActive: mockGetActive,
      create: mockCreate,
    };
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/escalation', () => ({
  EscalationRepository: vi.fn().mockImplementation(function () {
    return {
      getPending: mockGetPending,
    };
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/event', () => ({
  EventRepository: vi.fn().mockImplementation(function () {
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
// Import handlers under test (after mocks are declared)
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

// ============================================================================
// Tests
// ============================================================================

describe('GET /api/projects', () => {
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

  it('returns project list when authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const now = new Date().toISOString();
    mockGetActive.mockResolvedValueOnce({
      items: [
        {
          id: 'proj-1',
          name: 'Project One',
          status: 'active',
          source: 'jira',
          sourceProjectKey: 'PROJ',
          autonomyLevel: 'monitoring',
          updatedAt: now,
        },
      ],
    });
    mockGetPending.mockResolvedValueOnce({ items: [] });
    mockGetByProject.mockResolvedValueOnce({ items: [{ createdAt: now }] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.projects[0].id).toBe('proj-1');
    expect(body.projects[0].name).toBe('Project One');
    expect(body.projects[0].healthStatus).toBe('healthy');
  });

  it('calculates warning health status for projects with pending escalations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const now = new Date().toISOString();
    mockGetActive.mockResolvedValueOnce({
      items: [
        {
          id: 'proj-2',
          name: 'Project Two',
          status: 'active',
          source: 'jira',
          sourceProjectKey: 'P2',
          autonomyLevel: 'artefact',
          updatedAt: now,
        },
      ],
    });
    mockGetPending.mockResolvedValueOnce({ items: [{ projectId: 'proj-2' }] });
    mockGetByProject.mockResolvedValueOnce({ items: [{ createdAt: now }] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects[0].healthStatus).toBe('warning');
    expect(body.projects[0].pendingEscalations).toBe(1);
  });

  it('calculates error health status for projects with 3+ pending escalations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const now = new Date().toISOString();
    mockGetActive.mockResolvedValueOnce({
      items: [
        {
          id: 'proj-3',
          name: 'Project Three',
          status: 'active',
          source: 'jira',
          sourceProjectKey: 'P3',
          autonomyLevel: 'tactical',
          updatedAt: now,
        },
      ],
    });
    mockGetPending.mockResolvedValueOnce({
      items: [
        { projectId: 'proj-3' },
        { projectId: 'proj-3' },
        { projectId: 'proj-3' },
      ],
    });
    mockGetByProject.mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects[0].healthStatus).toBe('error');
  });

  it('returns empty list when no active projects', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetActive.mockResolvedValueOnce({ items: [] });
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetActive.mockRejectedValueOnce(
      new Error('DynamoDB connection failed')
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch projects');
  });
});

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Project',
        source: 'jira',
        sourceProjectKey: 'NP',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('creates a project with valid data', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCreate.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Project',
        source: 'jira',
        sourceProjectKey: 'NP',
        description: 'A test project',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project).toBeDefined();
    expect(body.project.name).toBe('New Project');
    expect(body.project.source).toBe('jira');
    expect(body.project.sourceProjectKey).toBe('NP');
    expect(body.project.status).toBe('active');
    expect(body.project.autonomyLevel).toBe('monitoring');
    expect(body.project.id).toMatch(/^proj-/);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('returns 400 when required fields are missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Missing Fields' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid project data');
  });

  it('returns 400 when name is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({ source: 'jira', sourceProjectKey: 'NP' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid project data');
  });

  it('uses provided autonomy level', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCreate.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Tactical Project',
        source: 'jira',
        sourceProjectKey: 'TP',
        autonomyLevel: 'tactical',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project.autonomyLevel).toBe('tactical');
  });

  it('returns 500 on database error during creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCreate.mockRejectedValueOnce(new Error('DynamoDB write failed'));

    const request = createRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Error Project',
        source: 'jira',
        sourceProjectKey: 'EP',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to create project');
  });
});
