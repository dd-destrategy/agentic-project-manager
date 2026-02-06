/**
 * Tests for GET /api/ingest and POST /api/ingest
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockList = vi.fn();
const mockCreate = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  IngestionSessionRepository: vi.fn().mockImplementation(function () {
    return {
      list: mockList,
      create: mockCreate,
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

const MOCK_INGEST_SESSION = {
  id: 'ingest-1',
  title: 'Sprint Review Notes',
  status: 'active',
  projectId: 'proj-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — GET /api/ingest
// ============================================================================

describe('GET /api/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/ingest');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns active sessions by default', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockList.mockResolvedValueOnce({
      items: [MOCK_INGEST_SESSION],
    });

    const request = createRequest('http://localhost:3000/api/ingest');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.sessions[0].id).toBe('ingest-1');
    expect(mockList).toHaveBeenCalledWith({ status: 'active', limit: 20 });
  });

  it('returns archived sessions when status=archived', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const archivedSession = { ...MOCK_INGEST_SESSION, status: 'archived' };
    mockList.mockResolvedValueOnce({ items: [archivedSession] });

    const request = createRequest(
      'http://localhost:3000/api/ingest?status=archived'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(mockList).toHaveBeenCalledWith({ status: 'archived', limit: 20 });
  });

  it('respects custom limit parameter', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockList.mockResolvedValueOnce({ items: [] });

    const request = createRequest('http://localhost:3000/api/ingest?limit=5');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({ status: 'active', limit: 5 });
  });

  it('returns empty list when no sessions exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockList.mockResolvedValueOnce({ items: [] });

    const request = createRequest('http://localhost:3000/api/ingest');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockList.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/ingest');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to list ingestion sessions');
  });
});

// ============================================================================
// Tests — POST /api/ingest
// ============================================================================

describe('POST /api/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Session' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('creates a session with valid data', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCreate.mockResolvedValueOnce(MOCK_INGEST_SESSION);

    const request = createRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ title: 'Sprint Review Notes' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe('ingest-1');
    expect(body.title).toBe('Sprint Review Notes');
    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Sprint Review Notes',
      projectId: undefined,
    });
  });

  it('creates a session with projectId', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCreate.mockResolvedValueOnce({
      ...MOCK_INGEST_SESSION,
      projectId: 'proj-1',
    });

    const request = createRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Project Notes',
        projectId: 'proj-1',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Project Notes',
      projectId: 'proj-1',
    });
  });

  it('returns 400 when title is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when title is empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 500 on database error during creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCreate.mockRejectedValueOnce(new Error('DB write failed'));

    const request = createRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: JSON.stringify({ title: 'Will Fail' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to create ingestion session');
  });
});
