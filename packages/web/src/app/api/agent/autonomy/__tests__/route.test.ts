/**
 * Tests for GET, PATCH, POST /api/agent/autonomy
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

const mockGetAutonomySettings = vi.fn();
const mockSetAutonomyLevel = vi.fn();
const mockSetDryRun = vi.fn();
const mockAcknowledgeAutonomyChange = vi.fn();
const mockClearPendingAcknowledgement = vi.fn();

vi.mock('@agentic-pm/core/db', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@agentic-pm/core/db/repositories/agent-config', () => ({
  AgentConfigRepository: vi.fn().mockImplementation(function () {
    return {
      getAutonomySettings: mockGetAutonomySettings,
      setAutonomyLevel: mockSetAutonomyLevel,
      setDryRun: mockSetDryRun,
      acknowledgeAutonomyChange: mockAcknowledgeAutonomyChange,
      clearPendingAcknowledgement: mockClearPendingAcknowledgement,
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

import { GET, PATCH, POST } from '../route';

// ============================================================================
// Helpers
// ============================================================================

function createRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

const MOCK_SESSION = {
  user: { email: 'test@example.com', name: 'Test User' },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_AUTONOMY_SETTINGS = {
  autonomyLevel: 'monitoring' as const,
  dryRun: false,
  pendingAcknowledgement: null,
};

// ============================================================================
// Tests — GET /api/agent/autonomy
// ============================================================================

describe('GET /api/agent/autonomy', () => {
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

  it('returns autonomy settings successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomySettings.mockResolvedValueOnce(MOCK_AUTONOMY_SETTINGS);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.autonomyLevel).toBe('monitoring');
    expect(body.dryRun).toBe(false);
    expect(body.pendingAcknowledgement).toBeNull();
    expect(mockGetAutonomySettings).toHaveBeenCalledTimes(1);
  });

  it('returns settings with pending acknowledgement', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomySettings.mockResolvedValueOnce({
      ...MOCK_AUTONOMY_SETTINGS,
      pendingAcknowledgement: {
        previousLevel: 'monitoring',
        newLevel: 'artefact',
        changedAt: '2024-01-01T00:00:00Z',
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pendingAcknowledgement).toBeDefined();
    expect(body.pendingAcknowledgement.newLevel).toBe('artefact');
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockGetAutonomySettings.mockRejectedValueOnce(new Error('DB error'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch autonomy settings');
  });
});

// ============================================================================
// Tests — PATCH /api/agent/autonomy
// ============================================================================

describe('PATCH /api/agent/autonomy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ autonomyLevel: 'artefact' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('updates autonomy level successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockSetAutonomyLevel.mockResolvedValueOnce(undefined);
    mockGetAutonomySettings.mockResolvedValueOnce({
      ...MOCK_AUTONOMY_SETTINGS,
      autonomyLevel: 'artefact',
    });

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ autonomyLevel: 'artefact' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.autonomyLevel).toBe('artefact');
    expect(mockSetAutonomyLevel).toHaveBeenCalledWith('artefact');
  });

  it('updates dry-run mode successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockSetDryRun.mockResolvedValueOnce(undefined);
    mockGetAutonomySettings.mockResolvedValueOnce({
      ...MOCK_AUTONOMY_SETTINGS,
      dryRun: true,
    });

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ dryRun: true }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(mockSetDryRun).toHaveBeenCalledWith(true);
  });

  it('updates both autonomy level and dry-run mode', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockSetAutonomyLevel.mockResolvedValueOnce(undefined);
    mockSetDryRun.mockResolvedValueOnce(undefined);
    mockGetAutonomySettings.mockResolvedValueOnce({
      autonomyLevel: 'tactical',
      dryRun: true,
      pendingAcknowledgement: null,
    });

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ autonomyLevel: 'tactical', dryRun: true }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.autonomyLevel).toBe('tactical');
    expect(body.dryRun).toBe(true);
    expect(mockSetAutonomyLevel).toHaveBeenCalledWith('tactical');
    expect(mockSetDryRun).toHaveBeenCalledWith(true);
  });

  it('returns 400 on invalid autonomy level', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ autonomyLevel: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 on invalid dry-run value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ dryRun: 'yes' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockSetAutonomyLevel.mockRejectedValueOnce(new Error('DB error'));

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'PATCH',
      body: JSON.stringify({ autonomyLevel: 'artefact' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to update autonomy settings');
  });
});

// ============================================================================
// Tests — POST /api/agent/autonomy (acknowledge)
// ============================================================================

describe('POST /api/agent/autonomy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'POST',
      body: JSON.stringify({ action: 'acknowledge' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorised');
  });

  it('acknowledges autonomy change successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockAcknowledgeAutonomyChange.mockResolvedValueOnce(undefined);
    mockGetAutonomySettings.mockResolvedValueOnce(MOCK_AUTONOMY_SETTINGS);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'POST',
      body: JSON.stringify({ action: 'acknowledge' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    await response.json();

    expect(response.status).toBe(200);
    expect(mockAcknowledgeAutonomyChange).toHaveBeenCalledTimes(1);
    expect(mockGetAutonomySettings).toHaveBeenCalledTimes(1);
  });

  it('clears pending acknowledgement successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockClearPendingAcknowledgement.mockResolvedValueOnce(undefined);
    mockGetAutonomySettings.mockResolvedValueOnce(MOCK_AUTONOMY_SETTINGS);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    await response.json();

    expect(response.status).toBe(200);
    expect(mockClearPendingAcknowledgement).toHaveBeenCalledTimes(1);
    expect(mockGetAutonomySettings).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on invalid action', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'POST',
      body: JSON.stringify({ action: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 on missing action', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockAcknowledgeAutonomyChange.mockRejectedValueOnce(new Error('DB error'));

    const request = createRequest('http://localhost:3000/api/agent/autonomy', {
      method: 'POST',
      body: JSON.stringify({ action: 'acknowledge' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to process acknowledgement');
  });
});
