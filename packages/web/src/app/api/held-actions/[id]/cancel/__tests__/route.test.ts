/**
 * Tests for POST /api/held-actions/[id]/cancel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockCancel = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/held-action', () => ({
  HeldActionRepository: vi.fn().mockImplementation(function () {
    return {
      cancel: mockCancel,
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

import { POST } from '../route';

// ============================================================================
// Helpers
// ============================================================================

function createRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

function createParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_HELD_ACTION = {
  id: 'ha-1',
  projectId: 'proj-1',
  actionType: 'create_jira_ticket',
  status: 'cancelled',
  proposedAction: {
    summary: 'Create ticket for issue',
    details: { key: 'TP-123' },
  },
  rationale: 'This action requires approval',
  cancelledBy: 'test@example.com',
  cancelledAt: '2024-01-01T00:00:00Z',
  cancellationReason: 'Not needed',
  createdAt: '2024-01-01T00:00:00Z',
};

// ============================================================================
// Tests — POST /api/held-actions/[id]/cancel
// ============================================================================

describe('POST /api/held-actions/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('cancels held action successfully without reason', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCancel.mockResolvedValueOnce(MOCK_HELD_ACTION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.heldAction).toBeDefined();
    expect(body.heldAction.id).toBe('ha-1');
    expect(body.heldAction.status).toBe('cancelled');
    expect(mockCancel).toHaveBeenCalledWith(
      'proj-1',
      'ha-1',
      undefined,
      'test@example.com'
    );
  });

  it('cancels held action successfully with reason', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCancel.mockResolvedValueOnce(MOCK_HELD_ACTION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          reason: 'Action no longer needed',
        }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith(
      'proj-1',
      'ha-1',
      'Action no longer needed',
      'test@example.com'
    );
  });

  it('returns 400 when projectId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 409 when action not found or already processed', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCancel.mockResolvedValueOnce(null);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Action not found or already processed');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCancel.mockRejectedValueOnce(new Error('DB error'));

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to cancel held action');
  });

  it('uses default email when user email is not available', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: {},
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    mockCancel.mockResolvedValueOnce(MOCK_HELD_ACTION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));

    expect(response.status).toBe(200);
    expect(mockCancel).toHaveBeenCalledWith(
      'proj-1',
      'ha-1',
      undefined,
      'user'
    );
  });

  it('validates reason must be a string if provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1', reason: 123 }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});
