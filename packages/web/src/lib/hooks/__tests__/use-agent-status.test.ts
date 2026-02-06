import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAgentStatus, formatLastHeartbeat } from '../use-agent-status'

global.fetch = vi.fn()

describe('useAgentStatus', () => {
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

  it('fetches agent status successfully', async () => {
    const mockStatus = {
      status: 'active' as const,
      lastHeartbeat: '2024-01-01T00:00:00Z',
      nextScheduledRun: '2024-01-01T00:15:00Z',
      budgetStatus: {
        dailySpendUsd: 0.5,
        dailyLimitUsd: 5.0,
        degradationTier: 0,
      },
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatus,
    })

    const { result } = renderHook(() => useAgentStatus(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockStatus)
  })

  it('handles fetch errors', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAgentStatus(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('handles non-ok response', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useAgentStatus(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('polls for updates when enabled', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'active' }),
    })

    renderHook(() => useAgentStatus(), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/agent/status')
    })
  })
})

describe('formatLastHeartbeat', () => {
  const now = new Date('2024-01-01T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Never" for null timestamp', () => {
    expect(formatLastHeartbeat(null)).toBe('Never')
  })

  it('returns "Just now" for recent timestamps', () => {
    const recent = new Date('2024-01-01T11:59:30Z').toISOString()
    expect(formatLastHeartbeat(recent)).toBe('Just now')
  })

  it('returns minutes ago for timestamps within an hour', () => {
    const fiveMinutesAgo = new Date('2024-01-01T11:55:00Z').toISOString()
    expect(formatLastHeartbeat(fiveMinutesAgo)).toBe('5 minutes ago')

    const oneMinuteAgo = new Date('2024-01-01T11:59:00Z').toISOString()
    expect(formatLastHeartbeat(oneMinuteAgo)).toBe('1 minute ago')
  })

  it('returns hours ago for timestamps within a day', () => {
    const twoHoursAgo = new Date('2024-01-01T10:00:00Z').toISOString()
    expect(formatLastHeartbeat(twoHoursAgo)).toBe('2 hours ago')

    const oneHourAgo = new Date('2024-01-01T11:00:00Z').toISOString()
    expect(formatLastHeartbeat(oneHourAgo)).toBe('1 hour ago')
  })

  it('returns formatted date for timestamps over 24 hours ago', () => {
    const twoDaysAgo = new Date('2023-12-30T12:00:00Z').toISOString()
    const result = formatLastHeartbeat(twoDaysAgo)
    expect(result).toMatch(/\d{1,2}\s\w{3}/)
  })
})
