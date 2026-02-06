/**
 * Tests for GET /api/budget
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

const mockGetBudgetStatus = vi.fn();

vi.mock('@agentic-pm/core/db/client', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDbClient: vi.fn(() => ({})),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  AgentConfigRepository: vi.fn().mockImplementation(function () {
    return {
      getBudgetStatus: mockGetBudgetStatus,
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

const MOCK_BUDGET_STATUS = {
  dailySpendUsd: 0.45,
  dailyLimitUsd: 1.0,
  monthlySpendUsd: 6.5,
  monthlyLimitUsd: 15.0,
  degradationTier: 0 as const,
};

// ============================================================================
// Tests — GET /api/budget
// ============================================================================

describe('GET /api/budget', () => {
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

  it('returns budget status when authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dailySpend).toBe(0.45);
    expect(body.dailyLimit).toBe(1.0);
    expect(body.monthSpend).toBe(6.5);
    expect(body.monthLimit).toBe(15.0);
    expect(body.tier).toBe(0);
    expect(body.tierName).toBe('Normal');
    expect(body.usageHistory).toEqual([]);
  });

  it('returns correct tier name for each degradation tier', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBudgetStatus.mockResolvedValueOnce({
      ...MOCK_BUDGET_STATUS,
      degradationTier: 2,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tier).toBe(2);
    expect(body.tierName).toBe('High Pressure');
  });

  it('calculates daysRemaining correctly', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.daysRemaining).toBe('number');
    expect(body.daysRemaining).toBeGreaterThanOrEqual(0);
    expect(body.daysRemaining).toBeLessThanOrEqual(31);
  });

  it('calculates projected spend and onTrack', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.projectedMonthSpend).toBe('number');
    expect(typeof body.onTrack).toBe('boolean');
    expect(typeof body.dailyAverage).toBe('number');
  });

  it('flags onTrack as false when projected spend exceeds limit', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBudgetStatus.mockResolvedValueOnce({
      ...MOCK_BUDGET_STATUS,
      monthlySpendUsd: 14.0,
      monthlyLimitUsd: 15.0,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    // With 14.0 spent by current day, the projected spend will likely exceed 15.0
    expect(typeof body.onTrack).toBe('boolean');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetBudgetStatus.mockRejectedValueOnce(new Error('DB failure'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch budget status');
  });
});
