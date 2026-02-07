/**
 * Tests for GET /api/catchup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

const mockGetRecent = vi.fn();
const mockGetPending = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  EventRepository: vi.fn().mockImplementation(function () {
    return { getRecent: mockGetRecent };
  }),
  EscalationRepository: vi.fn().mockImplementation(function () {
    return { getPending: mockGetPending };
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

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

// ============================================================================
// Tests — GET /api/catchup
// ============================================================================

describe('GET /api/catchup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
    expect(body.code).toBe('UNAUTHORISED');
  });

  it('returns catch-up summary with events', async () => {
    const now = new Date();
    const recentTime = new Date(
      now.getTime() - 2 * 60 * 60 * 1000
    ).toISOString();

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [
        {
          id: 'evt-1',
          eventType: 'escalation_created',
          severity: 'warn',
          summary: 'Escalation raised',
          projectId: 'proj-1',
          createdAt: recentTime,
        },
        {
          id: 'evt-2',
          eventType: 'artefact_updated',
          severity: 'info',
          summary: 'RAID log updated',
          projectId: 'proj-1',
          createdAt: recentTime,
        },
      ],
    });
    mockGetPending.mockResolvedValueOnce({
      items: [{ id: 'esc-1', title: 'Pending escalation' }],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalationsCreated).toBe(1);
    expect(body.artefactsUpdated).toBe(1);
    expect(body.recentEvents).toHaveLength(2);
    expect(body.highlights).toEqual(
      expect.arrayContaining([
        expect.stringContaining('awaiting your decision'),
        expect.stringContaining('new escalation'),
        expect.stringContaining('artefact'),
      ])
    );
    expect(body.since).toBeDefined();
  });

  it('returns empty summary when no events', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({ items: [] });
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalationsCreated).toBe(0);
    expect(body.escalationsDecided).toBe(0);
    expect(body.artefactsUpdated).toBe(0);
    expect(body.actionsTaken).toBe(0);
    expect(body.actionsHeld).toBe(0);
    expect(body.signalsDetected).toBe(0);
    expect(body.recentEvents).toHaveLength(0);
    expect(body.highlights).toEqual([
      'All quiet — no significant activity while you were away',
    ]);
  });

  it('computes correct counts for different event types', async () => {
    const now = new Date();
    const recentTime = new Date(
      now.getTime() - 2 * 60 * 60 * 1000
    ).toISOString();

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({
      items: [
        {
          id: 'e1',
          eventType: 'escalation_created',
          severity: 'warn',
          summary: 's1',
          createdAt: recentTime,
        },
        {
          id: 'e2',
          eventType: 'escalation_decided',
          severity: 'info',
          summary: 's2',
          createdAt: recentTime,
        },
        {
          id: 'e3',
          eventType: 'artefact_updated',
          severity: 'info',
          summary: 's3',
          createdAt: recentTime,
        },
        {
          id: 'e4',
          eventType: 'artefact_updated',
          severity: 'info',
          summary: 's4',
          createdAt: recentTime,
        },
        {
          id: 'e5',
          eventType: 'action_taken',
          severity: 'info',
          summary: 's5',
          createdAt: recentTime,
        },
        {
          id: 'e6',
          eventType: 'action_executed',
          severity: 'info',
          summary: 's6',
          createdAt: recentTime,
        },
        {
          id: 'e7',
          eventType: 'action_held',
          severity: 'warn',
          summary: 's7',
          createdAt: recentTime,
        },
        {
          id: 'e8',
          eventType: 'signal_detected',
          severity: 'info',
          summary: 's8',
          createdAt: recentTime,
        },
        {
          id: 'e9',
          eventType: 'signal_detected',
          severity: 'info',
          summary: 's9',
          createdAt: recentTime,
        },
        {
          id: 'e10',
          eventType: 'signal_detected',
          severity: 'info',
          summary: 's10',
          createdAt: recentTime,
        },
      ],
    });
    mockGetPending.mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalationsCreated).toBe(1);
    expect(body.escalationsDecided).toBe(1);
    expect(body.artefactsUpdated).toBe(2);
    expect(body.actionsTaken).toBe(2);
    expect(body.actionsHeld).toBe(1);
    expect(body.signalsDetected).toBe(3);
  });

  it('includes pending escalation highlights', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockResolvedValueOnce({ items: [] });
    mockGetPending.mockResolvedValueOnce({
      items: [
        { id: 'esc-1', title: 'Budget overrun' },
        { id: 'esc-2', title: 'Scope change' },
      ],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.highlights).toEqual(
      expect.arrayContaining(['2 escalations awaiting your decision'])
    );
  });

  it('returns 500 on DB error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetRecent.mockRejectedValueOnce(new Error('DB failure'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to build catch-up summary');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
