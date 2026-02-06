/**
 * Tests for GET /api/ingest/[id] and DELETE /api/ingest/[id]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetById = vi.fn();
const mockArchive = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  IngestionSessionRepository: vi.fn().mockImplementation(function () {
    return {
      getById: mockGetById,
      archive: mockArchive,
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

import { GET, DELETE } from '../route';

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

const MOCK_INGEST_SESSION = {
  id: 'ingest-1',
  title: 'Sprint Review Notes',
  status: 'active',
  projectId: 'proj-1',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Here are the sprint notes',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'I have analysed the notes',
      createdAt: '2024-01-01T00:01:00Z',
    },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:01:00Z',
};

// ============================================================================
// Tests — GET /api/ingest/[id]
// ============================================================================

describe('GET /api/ingest/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/ingest/ingest-1');
    const response = await GET(request, createParams('ingest-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns ingestion session when found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_INGEST_SESSION);

    const request = createRequest('http://localhost:3000/api/ingest/ingest-1');
    const response = await GET(request, createParams('ingest-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('ingest-1');
    expect(body.title).toBe('Sprint Review Notes');
    expect(body.status).toBe('active');
    expect(body.messages).toHaveLength(2);
    expect(mockGetById).toHaveBeenCalledWith('ingest-1');
  });

  it('returns 404 when session not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/ingest/nonexistent'
    );
    const response = await GET(request, createParams('nonexistent'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Ingestion session not found');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/ingest/ingest-1');
    const response = await GET(request, createParams('ingest-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch ingestion session');
  });
});

// ============================================================================
// Tests — DELETE /api/ingest/[id]
// ============================================================================

describe('DELETE /api/ingest/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/ingest/ingest-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, createParams('ingest-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('archives session successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockArchive.mockResolvedValueOnce(undefined);

    const request = createRequest('http://localhost:3000/api/ingest/ingest-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, createParams('ingest-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockArchive).toHaveBeenCalledWith('ingest-1');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockArchive.mockRejectedValueOnce(new Error('Archive failed'));

    const request = createRequest('http://localhost:3000/api/ingest/ingest-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, createParams('ingest-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to archive ingestion session');
  });
});
