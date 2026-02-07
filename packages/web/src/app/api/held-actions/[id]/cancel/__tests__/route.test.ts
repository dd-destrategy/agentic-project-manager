/**
 * Tests for POST /api/held-actions/[id]/cancel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockCancel = vi.fn();
const mockRecordCancellation = vi.fn();
const mockEventCreate = vi.fn();

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

vi.mock('@agentic-pm/core/db/repositories/graduation-state', () => ({
  GraduationStateRepository: vi.fn().mockImplementation(function () {
    return {
      recordCancellation: mockRecordCancellation,
    };
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/event', () => ({
  EventRepository: vi.fn().mockImplementation(function () {
    return {
      create: mockEventCreate,
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

const MOCK_HELD_ACTION = {
  id: 'ha-1',
  projectId: 'proj-1',
  actionType: 'email_stakeholder',
  status: 'cancelled',
  payload: {
    to: ['user@example.com'],
    subject: 'Test',
    bodyText: 'Test email',
  },
  heldUntil: '2024-01-01T00:30:00Z',
  cancelledBy: 'test@example.com',
  cancelledAt: '2024-01-01T00:00:00Z',
  cancelReason: 'Not needed',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
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

  it('calls recordCancellation on successful cancellation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCancel.mockResolvedValueOnce(MOCK_HELD_ACTION);
    mockRecordCancellation.mockResolvedValueOnce({
      projectId: 'proj-1',
      actionType: 'email_stakeholder',
      consecutiveApprovals: 0,
      tier: 0,
      updatedAt: new Date().toISOString(),
    });

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
    expect(mockRecordCancellation).toHaveBeenCalledWith(
      'proj-1',
      'email_stakeholder'
    );
  });

  it('creates an event on successful cancellation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCancel.mockResolvedValueOnce(MOCK_HELD_ACTION);

    const request = createRequest(
      'http://localhost:3000/api/held-actions/ha-1/cancel',
      {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1', reason: 'Not needed' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const response = await POST(request, createParams('ha-1'));

    expect(response.status).toBe(200);
    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        eventType: 'action_rejected',
        severity: 'info',
        summary: expect.stringContaining('email_stakeholder'),
        detail: expect.objectContaining({
          relatedIds: { actionId: 'ha-1' },
          context: expect.objectContaining({
            actionType: 'email_stakeholder',
            reason: 'Not needed',
            decidedBy: 'test@example.com',
          }),
        }),
      })
    );
  });

  it('does not call recordCancellation when action not found', async () => {
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

    expect(response.status).toBe(409);
    expect(mockRecordCancellation).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });
});
