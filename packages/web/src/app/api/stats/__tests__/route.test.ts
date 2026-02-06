/**
 * Tests for GET /api/stats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

const mockGetByDate = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories/event', () => ({
  EventRepository: vi.fn().mockImplementation(function () {
    return {
      getByDate: mockGetByDate,
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

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

function createEvents(types: string[]) {
  return types.map((eventType, i) => ({
    id: `evt-${i}`,
    projectId: 'proj-1',
    eventType,
    summary: `Event ${i}`,
    detail: {},
    createdAt: new Date().toISOString(),
  }));
}

// ============================================================================
// Tests — GET /api/stats
// ============================================================================

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('returns stats with zero counts when no events', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByDate.mockResolvedValue({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.last24Hours).toBeDefined();
    expect(body.today).toBeDefined();
    expect(body.comparison).toBeDefined();
    expect(body.today.cyclesRun).toBe(0);
    expect(body.today.signalsDetected).toBe(0);
    expect(body.today.actionsTaken).toBe(0);
    expect(body.today.actionsHeld).toBe(0);
    expect(body.today.artefactsUpdated).toBe(0);
    expect(body.today.escalationsCreated).toBe(0);
    expect(body.today.escalationsResolved).toBe(0);
    expect(body.today.llmCostUsd).toBe(0);
    expect(body.today.tokensUsed).toBe(0);
  });

  it('aggregates event types correctly for today', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const todayEvents = createEvents([
      'heartbeat',
      'heartbeat_with_changes',
      'signal_detected',
      'action_executed',
      'action_held',
      'artefact_updated',
      'escalation_created',
      'escalation_decided',
    ]);

    // First call is for today, second for yesterday
    mockGetByDate
      .mockResolvedValueOnce({ items: todayEvents })
      .mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.today.cyclesRun).toBe(2);
    expect(body.today.signalsDetected).toBe(1);
    expect(body.today.actionsTaken).toBe(1);
    expect(body.today.actionsHeld).toBe(1);
    expect(body.today.artefactsUpdated).toBe(1);
    expect(body.today.escalationsCreated).toBe(1);
    expect(body.today.escalationsResolved).toBe(1);
  });

  it('accumulates LLM costs from event details', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const eventsWithCosts = [
      {
        id: 'evt-1',
        projectId: 'proj-1',
        eventType: 'heartbeat',
        summary: 'Cycle 1',
        detail: { context: { llmCostUsd: 0.02, tokensUsed: 500 } },
        createdAt: new Date().toISOString(),
      },
      {
        id: 'evt-2',
        projectId: 'proj-1',
        eventType: 'action_executed',
        summary: 'Action 1',
        detail: { context: { llmCostUsd: 0.05, tokensUsed: 1200 } },
        createdAt: new Date().toISOString(),
      },
    ];

    mockGetByDate
      .mockResolvedValueOnce({ items: eventsWithCosts })
      .mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.today.llmCostUsd).toBeCloseTo(0.07, 5);
    expect(body.today.tokensUsed).toBe(1700);
  });

  it('includes comparison metrics', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const todayEvents = createEvents(['heartbeat', 'signal_detected']);
    mockGetByDate
      .mockResolvedValueOnce({ items: todayEvents })
      .mockResolvedValueOnce({ items: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.comparison.cyclesChange).toBe('number');
    expect(typeof body.comparison.signalsChange).toBe('number');
    expect(typeof body.comparison.actionsChange).toBe('number');
  });

  it('calls getByDate for today and yesterday', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByDate.mockResolvedValue({ items: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetByDate).toHaveBeenCalledTimes(2);
    // Both calls should use limit 1000
    expect(mockGetByDate).toHaveBeenCalledWith(expect.any(String), {
      limit: 1000,
    });
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetByDate.mockRejectedValueOnce(new Error('DB failure'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch activity statistics');
  });
});
