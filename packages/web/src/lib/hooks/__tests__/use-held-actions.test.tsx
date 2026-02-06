import { afterEach , describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useHeldActions,
  usePendingHeldActions,
  usePendingHeldActionCount,
  formatTimeRemaining,
  getActionTypeLabel,
  getActionTypeIcon,
} from '../use-held-actions'

global.fetch = vi.fn()

describe('useHeldActions', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('fetches held actions successfully', async () => {
    const mockResponse = {
      actions: [],
      count: 0,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const { result } = renderHook(() => useHeldActions(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResponse)
  })

  it('passes status filter to API', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [], count: 0 }),
    })

    renderHook(() => useHeldActions({ status: 'approved' }), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=approved')
      )
    })
  })

  it('defaults to pending status', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [], count: 0 }),
    })

    renderHook(() => useHeldActions(), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending')
      )
    })
  })

  it('passes projectId filter to API', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [], count: 0 }),
    })

    renderHook(() => useHeldActions({ projectId: 'proj-123' }), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('projectId=proj-123')
      )
    })
  })

  it('passes limit to API', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [], count: 0 }),
    })

    renderHook(() => useHeldActions({ limit: 100 }), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=100')
      )
    })
  })
})

describe('usePendingHeldActions', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('fetches pending held actions', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [], count: 0 }),
    })

    renderHook(() => usePendingHeldActions(), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending')
      )
    })
  })
})

describe('usePendingHeldActionCount', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('returns count from API response', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [], count: 3 }),
    })

    const { result } = renderHook(() => usePendingHeldActionCount(), { wrapper })

    await waitFor(() => {
      expect(result.current.count).toBe(3)
    })
  })

  it('returns 0 when no data', () => {
    ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => usePendingHeldActionCount(), { wrapper })

    expect(result.current.count).toBe(0)
  })
})

describe('formatTimeRemaining', () => {
  const now = Date.now()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Executing..." for past timestamps', () => {
    const past = new Date(now - 1000).toISOString()
    expect(formatTimeRemaining(past)).toBe('Executing...')
  })

  it('returns seconds for very short durations', () => {
    const thirtySecondsLater = new Date(now + 30000).toISOString()
    expect(formatTimeRemaining(thirtySecondsLater)).toBe('30s')
  })

  it('returns minutes and seconds for medium durations', () => {
    const fiveMinutesLater = new Date(now + 5 * 60000 + 30000).toISOString()
    expect(formatTimeRemaining(fiveMinutesLater)).toBe('5m 30s')
  })

  it('returns hours and minutes for longer durations', () => {
    const twoHoursLater = new Date(now + 2 * 60 * 60000 + 15 * 60000).toISOString()
    expect(formatTimeRemaining(twoHoursLater)).toBe('2h 15m')
  })

  it('returns days and hours for very long durations', () => {
    const threeDaysLater = new Date(now + 3 * 24 * 60 * 60000 + 5 * 60 * 60000).toISOString()
    expect(formatTimeRemaining(threeDaysLater)).toBe('3d 5h')
  })
})

describe('getActionTypeLabel', () => {
  it('returns correct label for email_stakeholder', () => {
    expect(getActionTypeLabel('email_stakeholder')).toBe('Email')
  })

  it('returns correct label for jira_status_change', () => {
    expect(getActionTypeLabel('jira_status_change')).toBe('Jira Status Change')
  })

  it('returns action type as-is for unknown types', () => {
    expect(getActionTypeLabel('unknown_type' as any)).toBe('unknown_type')
  })
})

describe('getActionTypeIcon', () => {
  it('returns correct icon for email_stakeholder', () => {
    expect(getActionTypeIcon('email_stakeholder')).toBe('mail')
  })

  it('returns correct icon for jira_status_change', () => {
    expect(getActionTypeIcon('jira_status_change')).toBe('git-branch')
  })

  it('returns default icon for unknown types', () => {
    expect(getActionTypeIcon('unknown_type' as any)).toBe('circle')
  })
})
