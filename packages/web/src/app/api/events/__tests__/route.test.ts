/**
 * Tests for GET /api/events
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetByProject = vi.fn();
const mockGetRecent = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  EventRepository: vi.fn().mockImplementation(function () {
    return {
      getByProject: mockGetByProject,
      getRecent: mockGetRecent,
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

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_EVENT = {
  id: 'evt-1',
  projectId: 'proj-1',
  eventType: 'heartbeat',
  summary: 'Agent cycle completed',
  detail: {},
  createdAt: '2024-01-01T12:00:00Z',
};

// ============================================================================
// Tests — GET /api/events
// ============================================================================

describe('GET /api/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns recent events by default', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [MOCK_EVENT],
      nextCursor: undefined,
      hasMore: false,
    });

    const request = createRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe('evt-1');
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(mockGetRecent).toHaveBeenCalledWith({ limit: 20, days: 2 });
  });

  it('filters by projectId when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByProject.mockResolvedValueOnce({
      items: [MOCK_EVENT],
      nextCursor: 'abc123',
      hasMore: true,
    });

    const request = createRequest(
      'http://localhost:3000/api/events?projectId=proj-1'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe('abc123');
    expect(mockGetByProject).toHaveBeenCalledWith('proj-1', { limit: 20 });
  });

  it('respects custom limit parameter', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const request = createRequest('http://localhost:3000/api/events?limit=5');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetRecent).toHaveBeenCalledWith({ limit: 5, days: 2 });
  });

  it('caps limit at 100', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const request = createRequest('http://localhost:3000/api/events?limit=500');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetRecent).toHaveBeenCalledWith({ limit: 100, days: 2 });
  });

  it('returns empty list when no events exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const request = createRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(0);
    expect(body.hasMore).toBe(false);
  });

  it('returns nextCursor as null when undefined', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [MOCK_EVENT],
      nextCursor: undefined,
      hasMore: false,
    });

    const request = createRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nextCursor).toBeNull();
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch events');
  });
});
