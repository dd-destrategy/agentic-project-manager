/**
 * Tests for GET/PATCH /api/decisions/[projectId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGet = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ArtefactRepository: vi.fn().mockImplementation(function () {
    return { get: mockGet, update: mockUpdate };
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

import { GET, PATCH } from '../route';

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

const MOCK_DECISION_LOG = {
  content: {
    decisions: [
      {
        id: 'dec-1',
        title: 'Use DynamoDB',
        context: 'Need a database',
        decision: 'Go with DynamoDB',
        rationale: 'Cost effective',
        madeBy: 'PM',
        date: '2025-01-01',
        status: 'decided',
        optionsConsidered: ['PostgreSQL', 'DynamoDB'],
        relatedRaidItems: [],
        outcome: null,
        outcomeDate: null,
        outcomeStatus: null,
        reviewDate: null,
        lessonsLearned: null,
      },
      {
        id: 'dec-2',
        title: 'Use Next.js',
        context: 'Need a frontend',
        decision: 'Go with Next.js',
        rationale: 'SSR support',
        madeBy: 'PM',
        date: '2025-01-02',
        status: 'decided',
        optionsConsidered: ['React SPA', 'Next.js'],
        relatedRaidItems: [],
        outcome: null,
        outcomeDate: null,
        outcomeStatus: null,
        reviewDate: null,
        lessonsLearned: null,
      },
    ],
  },
};

const PARAMS = { params: Promise.resolve({ projectId: 'proj-1' }) };

// ============================================================================
// Tests — GET /api/decisions/[projectId]
// ============================================================================

describe('GET /api/decisions/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/decisions/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns decisions from decision_log artefact', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockResolvedValueOnce(MOCK_DECISION_LOG);

    const request = createRequest('/api/decisions/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decisions).toHaveLength(2);
    expect(body.decisions[0].id).toBe('dec-1');
    expect(body.decisions[0].title).toBe('Use DynamoDB');
    expect(body.decisions[1].id).toBe('dec-2');
    expect(body.projectId).toBe('proj-1');
    expect(mockGet).toHaveBeenCalledWith('proj-1', 'decision_log');
  });

  it('returns empty array when no artefact exists', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockResolvedValueOnce(null);

    const request = createRequest('/api/decisions/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decisions).toEqual([]);
    expect(body.projectId).toBe('proj-1');
  });

  it('returns 500 on error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('/api/decisions/proj-1');
    const response = await GET(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch decisions');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

// ============================================================================
// Tests — PATCH /api/decisions/[projectId]
// ============================================================================

describe('PATCH /api/decisions/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('/api/decisions/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ decisionId: 'dec-1', outcome: 'Success' }),
    });
    const response = await PATCH(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('updates decision outcome fields', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockResolvedValueOnce(MOCK_DECISION_LOG);
    mockUpdate.mockResolvedValueOnce(undefined);

    const request = createRequest('/api/decisions/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({
        decisionId: 'dec-1',
        outcome: 'Worked well',
        outcomeDate: '2025-06-01',
        outcomeStatus: 'positive',
        lessonsLearned: 'Good choice overall',
      }),
    });
    const response = await PATCH(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.decision.outcome).toBe('Worked well');
    expect(body.decision.outcomeDate).toBe('2025-06-01');
    expect(body.decision.outcomeStatus).toBe('positive');
    expect(body.decision.lessonsLearned).toBe('Good choice overall');
    expect(mockUpdate).toHaveBeenCalledWith(
      'proj-1',
      'decision_log',
      expect.objectContaining({ decisions: expect.any(Array) }),
      expect.objectContaining({ updatedBy: 'user' })
    );
  });

  it('returns 400 when decisionId missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('/api/decisions/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ outcome: 'Success' }),
    });
    const response = await PATCH(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Decision ID is required');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns 404 when decision not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockResolvedValueOnce(MOCK_DECISION_LOG);

    const request = createRequest('/api/decisions/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ decisionId: 'dec-999', outcome: 'N/A' }),
    });
    const response = await PATCH(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Decision "dec-999" not found');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 404 when artefact not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockResolvedValueOnce(null);

    const request = createRequest('/api/decisions/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ decisionId: 'dec-1', outcome: 'N/A' }),
    });
    const response = await PATCH(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Decision log not found for this project');
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 500 on error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGet.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('/api/decisions/proj-1', {
      method: 'PATCH',
      body: JSON.stringify({ decisionId: 'dec-1', outcome: 'N/A' }),
    });
    const response = await PATCH(request, PARAMS);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to update decision outcome');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
