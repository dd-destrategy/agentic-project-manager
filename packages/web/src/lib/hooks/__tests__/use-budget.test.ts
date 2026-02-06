import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useBudgetStatus } from '../use-budget'

global.fetch = vi.fn()

describe('useBudgetStatus', () => {
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

  it('fetches budget status successfully', async () => {
    const mockBudget = {
      dailySpend: 1.5,
      dailyLimit: 5.0,
      monthSpend: 15.0,
      monthLimit: 100.0,
      dailyAverage: 2.0,
      tier: 0,
      tierName: 'Normal',
      daysRemaining: 15,
      projectedMonthSpend: 30.0,
      onTrack: true,
      usageHistory: [],
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBudget,
    })

    const { result } = renderHook(() => useBudgetStatus(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockBudget)
  })

  it('handles fetch errors', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => useBudgetStatus(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('handles non-ok response', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const { result } = renderHook(() => useBudgetStatus(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('calls correct API endpoint', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    renderHook(() => useBudgetStatus(), { wrapper })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/budget')
    })
  })
})
