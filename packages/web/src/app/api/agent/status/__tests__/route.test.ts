/**
 * Tests for GET /api/agent/status
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

const mockGetLastHeartbeat = vi.fn();
const mockGetBudgetStatus = vi.fn();
const mockGetConfig = vi.fn();
const mockGetLatestHeartbeat = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@agentic-pm/core/db/repositories', () => ({
  AgentConfigRepository: vi.fn().mockImplementation(function () {
    return {
      getLastHeartbeat: mockGetLastHeartbeat,
      getBudgetStatus: mockGetBudgetStatus,
      getConfig: mockGetConfig,
    };
  }),
  EventRepository: vi.fn().mockImplementation(function () {
    return {
      getLatestHeartbeat: mockGetLatestHeartbeat,
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

import { GET } from '../route';

// ============================================================================
// Helpers
// ============================================================================

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_BUDGET_STATUS = {
  dailySpendUsd: 0.25,
  dailyLimitUsd: 0.5,
  monthlySpendUsd: 3.0,
  monthlyLimitUsd: 7.0,
  degradationTier: 0,
};

const MOCK_CONFIG = {
  pollingIntervalMinutes: 15,
  autonomyLevel: 'monitoring',
  dryRun: false,
};

// ============================================================================
// Tests — GET /api/agent/status
// ============================================================================

describe('GET /api/agent/status', () => {
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

  it('returns active status when heartbeat is recent', async () => {
    const recentHeartbeat = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 minutes ago
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetLastHeartbeat.mockResolvedValueOnce(recentHeartbeat);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);
    mockGetConfig.mockResolvedValueOnce(MOCK_CONFIG);
    mockGetLatestHeartbeat.mockResolvedValueOnce({
      detail: { context: { cycleId: 'cycle-123' } },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('active');
    expect(body.lastHeartbeat).toBe(recentHeartbeat);
    expect(body.currentCycleState).toBe('cycle-123');
    expect(body.budgetStatus).toEqual(MOCK_BUDGET_STATUS);
    expect(body.integrations).toHaveLength(2);
    expect(body.integrations[0].name).toBe('jira');
    expect(body.integrations[1].name).toBe('outlook');
  });

  it('returns stopped status when heartbeat is old', async () => {
    const oldHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetLastHeartbeat.mockResolvedValueOnce(oldHeartbeat);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);
    mockGetConfig.mockResolvedValueOnce(MOCK_CONFIG);
    mockGetLatestHeartbeat.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('stopped');
    expect(body.lastHeartbeat).toBe(oldHeartbeat);
    expect(body.currentCycleState).toBeNull();
  });

  it('returns never_run status when no heartbeat exists', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetLastHeartbeat.mockResolvedValueOnce(null);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);
    mockGetConfig.mockResolvedValueOnce(MOCK_CONFIG);
    mockGetLatestHeartbeat.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('never_run');
    expect(body.lastHeartbeat).toBeNull();
    expect(body.currentCycleState).toBeNull();
  });

  it('calculates next scheduled run based on polling interval', async () => {
    const lastHeartbeat = new Date('2024-01-01T12:00:00Z').toISOString();
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetLastHeartbeat.mockResolvedValueOnce(lastHeartbeat);
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);
    mockGetConfig.mockResolvedValueOnce({
      ...MOCK_CONFIG,
      pollingIntervalMinutes: 30,
    });
    mockGetLatestHeartbeat.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    const expectedNextRun = new Date('2024-01-01T12:30:00Z').toISOString();
    expect(body.nextScheduledRun).toBe(expectedNextRun);
  });

  it('returns 500 with error status on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetLastHeartbeat.mockRejectedValueOnce(new Error('DB failure'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.status).toBe('error');
    expect(body.error).toBe('Failed to fetch agent status');
    expect(body.budgetStatus).toBeDefined();
  });

  it('handles missing cycle context gracefully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetLastHeartbeat.mockResolvedValueOnce(new Date().toISOString());
    mockGetBudgetStatus.mockResolvedValueOnce(MOCK_BUDGET_STATUS);
    mockGetConfig.mockResolvedValueOnce(MOCK_CONFIG);
    mockGetLatestHeartbeat.mockResolvedValueOnce({
      detail: { context: {} },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentCycleState).toBeNull();
  });
});
