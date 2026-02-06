/**
 * Tests for GET, PATCH, DELETE /api/projects/[id]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockCountPendingByProject = vi.fn();
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
      getById: mockGetById,
      update: mockUpdate,
    };
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/escalation', () => ({
  EscalationRepository: vi.fn().mockImplementation(function () {
    return {
      countPendingByProject: mockCountPendingByProject,
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
// Import handlers under test
// ============================================================================

import { GET, PATCH, DELETE } from '../route';

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

const MOCK_PROJECT = {
  id: 'proj-1',
  name: 'Test Project',
  description: 'A test project',
  status: 'active',
  source: 'jira',
  sourceProjectKey: 'TP',
  autonomyLevel: 'monitoring',
  config: {},
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/projects/[id]
// ============================================================================

describe('GET /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/projects/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns project detail when found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT);
    mockCountPendingByProject.mockResolvedValueOnce(0);
    mockGetByProject.mockResolvedValueOnce({
      items: [{ createdAt: new Date().toISOString() }],
    });

    const request = createRequest('http://localhost:3000/api/projects/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project).toBeDefined();
    expect(body.project.id).toBe('proj-1');
    expect(body.project.name).toBe('Test Project');
    expect(body.project.healthStatus).toBe('healthy');
    expect(body.project.pendingEscalations).toBe(0);
  });

  it('returns 404 when project not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/projects/nonexistent'
    );
    const response = await GET(request, createParams('nonexistent'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Project not found');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockRejectedValueOnce(new Error('DB error'));

    const request = createRequest('http://localhost:3000/api/projects/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch project');
  });

  it('includes warning health status when escalations are pending', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT);
    mockCountPendingByProject.mockResolvedValueOnce(2);
    mockGetByProject.mockResolvedValueOnce({
      items: [{ createdAt: new Date().toISOString() }],
    });

    const request = createRequest('http://localhost:3000/api/projects/proj-1');
    const response = await GET(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.healthStatus).toBe('warning');
  });
});

// ============================================================================
// Tests — PATCH /api/projects/[id]
// ============================================================================

describe('PATCH /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/projects/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('updates project fields successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById
      .mockResolvedValueOnce(MOCK_PROJECT) // existsCheck
      .mockResolvedValueOnce({ ...MOCK_PROJECT, name: 'Updated Project' }); // after update
    mockUpdate.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/projects/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Project' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.name).toBe('Updated Project');
    expect(mockUpdate).toHaveBeenCalledWith('proj-1', {
      name: 'Updated Project',
    });
  });

  it('returns 404 when project does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/projects/missing',
      {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Update Missing' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await PATCH(request, createParams('missing'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Project not found');
  });

  it('returns 500 on database error during update', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT);
    mockUpdate.mockRejectedValueOnce(new Error('Update failed'));

    const request = createRequest('http://localhost:3000/api/projects/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Fail' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to update project');
  });
});

// ============================================================================
// Tests — DELETE /api/projects/[id]
// ============================================================================

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/projects/proj-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('archives project (soft delete) successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT);
    mockUpdate.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/projects/proj-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith('proj-1', { status: 'archived' });
  });

  it('returns 404 when project does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/projects/missing',
      {
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, createParams('missing'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Project not found');
  });

  it('returns 500 on database error during delete', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT);
    mockUpdate.mockRejectedValueOnce(new Error('Archive failed'));

    const request = createRequest('http://localhost:3000/api/projects/proj-1', {
      method: 'DELETE',
    });

    const response = await DELETE(request, createParams('proj-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to delete project');
  });
});
