/**
 * Tests for POST /api/extracted-items/[id]/apply
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetById = vi.fn();
const mockMarkApplied = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  ExtractedItemRepository: vi.fn().mockImplementation(function () {
    return {
      getById: mockGetById,
      markApplied: mockMarkApplied,
    };
  }),
}));

const mockApplyExtractedItem = vi.fn();
vi.mock('@agentic-pm/core/artefacts', () => ({
  applyExtractedItem: (...args: unknown[]) => mockApplyExtractedItem(...args),
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
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';

const MOCK_APPROVED_ITEM = {
  id: 'item-1',
  sessionId: 'sess-1',
  messageId: 'msg-1',
  type: 'risk',
  title: 'Budget overrun risk',
  content: 'The project may exceed its budget by 20%.',
  targetArtefact: 'raid_log',
  priority: 'high',
  status: 'approved',
  projectId: PROJECT_ID,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MOCK_PENDING_ITEM = {
  ...MOCK_APPROVED_ITEM,
  id: 'item-2',
  status: 'pending_review',
};

const MOCK_APPLIED_ITEM = {
  ...MOCK_APPROVED_ITEM,
  status: 'applied',
  appliedAt: '2024-01-02T00:00:00Z',
};

// ============================================================================
// Tests
// ============================================================================

describe('POST /api/extracted-items/[id]/apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-1/apply?sessionId=sess-1'
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns 400 when sessionId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-1/apply'
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('sessionId');
  });

  it('returns 404 when item not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-999/apply?sessionId=sess-1'
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-999' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('not found');
  });

  it('returns 400 when item is not approved', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_PENDING_ITEM);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-2/apply?sessionId=sess-1'
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-2' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('approved');
  });

  it('returns 200 on successful apply', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_APPROVED_ITEM);
    mockApplyExtractedItem.mockResolvedValueOnce({
      success: true,
      artefactType: 'raid_log',
      itemId: 'item-1',
    });
    mockMarkApplied.mockResolvedValueOnce(MOCK_APPLIED_ITEM);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-1/apply?sessionId=sess-1',
      { projectId: PROJECT_ID }
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.artefactType).toBe('raid_log');
    expect(body.item).toBeDefined();

    // Verify applyExtractedItem was called correctly
    expect(mockApplyExtractedItem).toHaveBeenCalledWith(
      MOCK_APPROVED_ITEM,
      PROJECT_ID,
      expect.anything()
    );
    expect(mockMarkApplied).toHaveBeenCalledWith('sess-1', 'item-1');
  });

  it('uses item projectId when body does not provide one', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_APPROVED_ITEM);
    mockApplyExtractedItem.mockResolvedValueOnce({
      success: true,
      artefactType: 'raid_log',
      itemId: 'item-1',
    });
    mockMarkApplied.mockResolvedValueOnce(MOCK_APPLIED_ITEM);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-1/apply?sessionId=sess-1'
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockApplyExtractedItem).toHaveBeenCalledWith(
      MOCK_APPROVED_ITEM,
      PROJECT_ID,
      expect.anything()
    );
  });

  it('returns 400 when no projectId is available', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const itemWithoutProject = { ...MOCK_APPROVED_ITEM, projectId: undefined };
    mockGetById.mockResolvedValueOnce(itemWithoutProject);

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-1/apply?sessionId=sess-1'
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('projectId is required');
  });

  it('returns 500 when applyExtractedItem fails', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetById.mockResolvedValueOnce(MOCK_APPROVED_ITEM);
    mockApplyExtractedItem.mockResolvedValueOnce({
      success: false,
      artefactType: 'raid_log',
      itemId: 'item-1',
      error: 'Merge failed',
    });

    const request = createRequest(
      'http://localhost:3000/api/extracted-items/item-1/apply?sessionId=sess-1',
      { projectId: PROJECT_ID }
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'item-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Merge failed');
  });
});
