/**
 * Tests for POST /api/query
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetAllForProject = vi.fn();
const mockGetByDate = vi.fn();
const mockGetActive = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ArtefactRepository: vi.fn().mockImplementation(function () {
    return { getAllForProject: mockGetAllForProject };
  }),
  EventRepository: vi.fn().mockImplementation(function () {
    return { getByDate: mockGetByDate };
  }),
  ProjectRepository: vi.fn().mockImplementation(function () {
    return { getActive: mockGetActive };
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

import { POST } from '../route';

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
// Tests — POST /api/query
// ============================================================================

describe('POST /api/query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is the status?' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns 400 when question missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/query', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Question is required');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns answer with project context', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([
      {
        type: 'delivery_state',
        content: { overallStatus: 'green', statusSummary: 'On track' },
      },
    ]);
    mockGetByDate.mockResolvedValueOnce({
      items: [
        {
          id: 'evt-1',
          projectId: 'proj-1',
          severity: 'info',
          summary: 'Deploy complete',
        },
      ],
    });

    const request = createRequest('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the status?',
        projectId: 'proj-1',
      }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.question).toBe('What is the status?');
    expect(body.answer).toBeDefined();
    expect(body.projectId).toBe('proj-1');
    expect(body.contextUsed).toBeGreaterThan(0);
    expect(body.timestamp).toBeDefined();
    expect(mockGetAllForProject).toHaveBeenCalledWith('proj-1');
  });

  it('returns answer without projectId', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetActive.mockResolvedValueOnce({
      items: [{ name: 'Project Alpha' }, { name: 'Project Beta' }],
    });

    const request = createRequest('/api/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'What projects are active?' }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.question).toBe('What projects are active?');
    expect(body.answer).toBeDefined();
    expect(body.contextUsed).toBeGreaterThan(0);
    expect(mockGetActive).toHaveBeenCalledWith({ limit: 10 });
  });

  it('returns blocker-specific answer', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAllForProject.mockResolvedValueOnce([
      {
        type: 'delivery_state',
        content: {
          overallStatus: 'red',
          blockers: [{ id: 'BLK-1', description: 'Waiting on credentials' }],
        },
      },
    ]);
    mockGetByDate.mockResolvedValueOnce({ items: [] });

    const request = createRequest('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question: 'Are there any blockers?',
        projectId: 'proj-1',
      }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toContain('blocker');
  });

  it('returns 500 on error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the status?',
        projectId: 'proj-1',
      }),
    });

    mockGetAllForProject.mockRejectedValueOnce(new Error('DB failure'));

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to process query');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
