/**
 * Tests for GET/POST /api/briefings/[projectId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetAllForProject = vi.fn();
const mockGetByDate = vi.fn();
const mockGetByProject = vi.fn();
const mockGetByProjectActions = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn(),
  ArtefactRepository: vi.fn().mockImplementation(function () {
    return { getAllForProject: mockGetAllForProject };
  }),
  EventRepository: vi.fn().mockImplementation(function () {
    return { getByDate: mockGetByDate };
  }),
  EscalationRepository: vi.fn().mockImplementation(function () {
    return { getByProject: mockGetByProject };
  }),
  HeldActionRepository: vi.fn().mockImplementation(function () {
    return { getByProject: mockGetByProjectActions };
  }),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
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

const PARAMS = { params: Promise.resolve({ projectId: 'proj-1' }) };

function setupEmptyProject() {
  mockGetAllForProject.mockResolvedValueOnce([]);
  mockGetByProject.mockResolvedValueOnce({ items: [] });
  mockGetByProjectActions.mockResolvedValueOnce({ items: [] });
  mockGetByDate.mockResolvedValueOnce({ items: [] });
}

function setupPopulatedProject() {
  mockGetAllForProject.mockResolvedValueOnce([
    {
      type: 'delivery_state',
      content: {
        overallStatus: 'amber',
        statusSummary: 'Sprint behind schedule',
        currentSprint: { name: 'Sprint 5', goal: 'Complete API layer' },
        blockers: [
          { id: 'BLK-1', description: 'Waiting on API keys', severity: 'high' },
        ],
      },
    },
    {
      type: 'raid_log',
      content: {
        items: [
          {
            type: 'risk',
            severity: 'critical',
            id: 'R-1',
            title: 'Budget overrun',
            status: 'open',
          },
          {
            type: 'issue',
            severity: 'high',
            id: 'I-1',
            title: 'Build failures',
            status: 'open',
          },
        ],
      },
    },
  ]);
  mockGetByProject.mockResolvedValueOnce({
    items: [{ id: 'esc-1', title: 'Approve scope change' }],
  });
  mockGetByProjectActions.mockResolvedValueOnce({
    items: [
      { id: 'act-1', actionType: 'email', heldUntil: new Date().toISOString() },
    ],
  });
  mockGetByDate.mockResolvedValueOnce({
    items: [
      {
        id: 'evt-1',
        projectId: 'proj-1',
        severity: 'warn',
        summary: 'Build failed',
      },
    ],
  });
}

// ============================================================================
// Tests — GET /api/briefings/[projectId]
// ============================================================================

describe('GET /api/briefings/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/briefings/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns briefing with sections', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupPopulatedProject();

    const request = createRequest('/api/briefings/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectId).toBe('proj-1');
    expect(body.meetingType).toBe('standup');
    expect(body.title).toBe('Standup Briefing');
    expect(body.generatedAt).toBeDefined();
    expect(body.sections.length).toBeGreaterThan(0);

    const headings = body.sections.map((s: { heading: string }) => s.heading);
    expect(headings).toEqual(
      expect.arrayContaining([expect.stringContaining('Project Status')])
    );
  });

  it('returns briefing with empty sections when no artefacts', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupEmptyProject();

    const request = createRequest('/api/briefings/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectId).toBe('proj-1');
    expect(body.sections).toEqual([]);
  });
});

// ============================================================================
// Tests — POST /api/briefings/[projectId]
// ============================================================================

describe('POST /api/briefings/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/briefings/proj-1', {
      method: 'POST',
      body: JSON.stringify({ meetingType: 'standup' }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('generates briefing with meeting type', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupPopulatedProject();

    const request = createRequest('/api/briefings/proj-1', {
      method: 'POST',
      body: JSON.stringify({ meetingType: 'steering_committee' }),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectId).toBe('proj-1');
    expect(body.meetingType).toBe('steering_committee');
    expect(body.title).toBe('Steering committee Briefing');
    expect(body.sections.length).toBeGreaterThan(0);
  });

  it('defaults to standup meeting type', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupEmptyProject();

    const request = createRequest('/api/briefings/proj-1', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meetingType).toBe('standup');
    expect(body.title).toBe('Standup Briefing');
  });
});
