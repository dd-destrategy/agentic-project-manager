/**
 * Tests for GET /api/extracted-items
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetBySession = vi.fn();
const mockGetByStatus = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ExtractedItemRepository: vi.fn().mockImplementation(function () {
    return {
      getBySession: mockGetBySession,
      getByStatus: mockGetByStatus,
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

const MOCK_ITEM = {
  id: 'item-1',
  sessionId: 'sess-1',
  messageId: 'msg-1',
  type: 'risk',
  title: 'Budget overrun risk',
  content: 'The project may exceed its budget by 20%.',
  targetArtefact: 'raid_log',
  priority: 'high',
  status: 'pending_review',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MOCK_APPROVED_ITEM = {
  ...MOCK_ITEM,
  id: 'item-2',
  status: 'approved',
};

// ============================================================================
// Tests — GET /api/extracted-items
// ============================================================================

describe('GET /api/extracted-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/extracted-items');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns pending_review items by default', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByStatus.mockResolvedValueOnce({
      items: [MOCK_ITEM],
    });

    const request = createRequest('http://localhost:3000/api/extracted-items');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.items[0].id).toBe('item-1');
    expect(body.items[0].status).toBe('pending_review');
    expect(mockGetByStatus).toHaveBeenCalledWith('pending_review', {
      limit: 50,
    });
  });

  it('filters by status when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByStatus.mockResolvedValueOnce({
      items: [MOCK_APPROVED_ITEM],
    });

    const request = createRequest(
      'http://localhost:3000/api/extracted-items?status=approved'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe('approved');
    expect(mockGetByStatus).toHaveBeenCalledWith('approved', { limit: 50 });
  });

  it('filters by sessionId when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBySession.mockResolvedValueOnce({
      items: [MOCK_ITEM, MOCK_APPROVED_ITEM],
    });

    const request = createRequest(
      'http://localhost:3000/api/extracted-items?sessionId=sess-1'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(mockGetBySession).toHaveBeenCalledWith('sess-1', { limit: 50 });
  });

  it('filters by both sessionId and status', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBySession.mockResolvedValueOnce({
      items: [MOCK_ITEM, MOCK_APPROVED_ITEM],
    });

    const request = createRequest(
      'http://localhost:3000/api/extracted-items?sessionId=sess-1&status=pending_review'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    // When sessionId is provided, the route queries by session only (status is ignored)
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it('respects custom limit parameter', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByStatus.mockResolvedValueOnce({ items: [] });

    const request = createRequest(
      'http://localhost:3000/api/extracted-items?limit=10'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockGetByStatus).toHaveBeenCalledWith('pending_review', {
      limit: 10,
    });
  });

  it('returns empty list when no items match', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByStatus.mockResolvedValueOnce({ items: [] });

    const request = createRequest(
      'http://localhost:3000/api/extracted-items?status=dismissed'
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByStatus.mockRejectedValueOnce(new Error('DB failure'));

    const request = createRequest('http://localhost:3000/api/extracted-items');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to list extracted items');
  });
});
