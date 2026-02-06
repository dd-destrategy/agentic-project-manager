import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useEscalations,
  usePendingEscalations,
  usePendingEscalationCount,
  useEscalation,
  formatEscalationTime,
  getRiskLevelVariant,
} from '../use-escalations'

global.fetch = vi.fn()

describe('useEscalations', () => {
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

  it('fetches escalations successfully', async () => {
    const mockResponse = {
      escalations: [],
      count: 0,
      hasMore: false,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const { result } = renderHook(() => useEscalations(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResponse)
  })

  it('passes status filter to API', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ escalations: [], count: 0, hasMore: false }),
    })

    renderHook(() => useEscalations({ status: 'pending' }), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending')
      )
    })
  })

  it('passes projectId filter to API', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ escalations: [], count: 0, hasMore: false }),
    })

    renderHook(() => useEscalations({ projectId: 'proj-123' }), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('projectId=proj-123')
      )
    })
  })

  it('passes limit to API', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ escalations: [], count: 0, hasMore: false }),
    })

    renderHook(() => useEscalations({ limit: 50 }), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=50')
      )
    })
  })
})

describe('usePendingEscalations', () => {
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

  it('fetches pending escalations', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ escalations: [], count: 0, hasMore: false }),
    })

    renderHook(() => usePendingEscalations(), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=pending')
      )
    })
  })
})

describe('usePendingEscalationCount', () => {
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
      json: async () => ({ escalations: [], count: 5, hasMore: false }),
    })

    const { result } = renderHook(() => usePendingEscalationCount(), { wrapper })

    await waitFor(() => {
      expect(result.current.count).toBe(5)
    })
  })

  it('returns 0 when no data', () => {
    ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => usePendingEscalationCount(), { wrapper })

    expect(result.current.count).toBe(0)
  })
})

describe('useEscalation', () => {
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

  it('fetches single escalation by ID', async () => {
    const mockEscalation = {
      id: 'esc-123',
      status: 'pending',
      reason: 'test',
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockEscalation,
    })

    const { result } = renderHook(() => useEscalation('esc-123'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockEscalation)
    expect(global.fetch).toHaveBeenCalledWith('/api/escalations/esc-123')
  })

  it('handles 404 error', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const { result } = renderHook(() => useEscalation('esc-404'), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('formatEscalationTime', () => {
  const now = new Date('2024-01-01T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Just now" for very recent timestamps', () => {
    const recent = new Date('2024-01-01T11:59:30Z').toISOString()
    expect(formatEscalationTime(recent)).toBe('Just now')
  })

  it('returns minutes ago', () => {
    const fiveMinutesAgo = new Date('2024-01-01T11:55:00Z').toISOString()
    expect(formatEscalationTime(fiveMinutesAgo)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const twoHoursAgo = new Date('2024-01-01T10:00:00Z').toISOString()
    expect(formatEscalationTime(twoHoursAgo)).toBe('2h ago')
  })

  it('returns "Yesterday" for yesterday', () => {
    const yesterday = new Date('2023-12-31T12:00:00Z').toISOString()
    expect(formatEscalationTime(yesterday)).toBe('Yesterday')
  })

  it('returns days ago for recent days', () => {
    const threeDaysAgo = new Date('2023-12-29T12:00:00Z').toISOString()
    expect(formatEscalationTime(threeDaysAgo)).toBe('3 days ago')
  })

  it('returns formatted date for older timestamps', () => {
    const eightDaysAgo = new Date('2023-12-24T12:00:00Z').toISOString()
    const result = formatEscalationTime(eightDaysAgo)
    expect(result).toMatch(/\d{1,2}\s\w{3}/)
  })
})

describe('getRiskLevelVariant', () => {
  it('returns success for low risk', () => {
    expect(getRiskLevelVariant('low')).toBe('success')
  })

  it('returns warning for medium risk', () => {
    expect(getRiskLevelVariant('medium')).toBe('warning')
  })

  it('returns error for high risk', () => {
    expect(getRiskLevelVariant('high')).toBe('error')
  })
})
