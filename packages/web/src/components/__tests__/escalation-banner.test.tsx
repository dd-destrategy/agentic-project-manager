import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EscalationBanner } from '../escalation-banner'
import * as hooks from '@/lib/hooks'

// Mock the hooks module
vi.mock('@/lib/hooks', () => ({
  usePendingEscalationCount: vi.fn(),
}))

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('EscalationBanner', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('does not render when loading', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 0,
      isLoading: true,
      error: null,
    })

    const { container } = render(<EscalationBanner />, { wrapper })
    expect(container).toBeEmptyDOMElement()
  })

  it('does not render when count is 0', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 0,
      isLoading: false,
      error: null,
    })

    const { container } = render(<EscalationBanner />, { wrapper })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders banner when there is 1 escalation', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 1,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    expect(screen.getByText(/1 escalation needs your attention/i)).toBeInTheDocument()
    expect(screen.getByText(/the agent is waiting for your input/i)).toBeInTheDocument()
  })

  it('renders banner when there are multiple escalations', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 5,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    expect(screen.getByText(/5 escalations need your attention/i)).toBeInTheDocument()
  })

  it('shows urgency indicator for multiple escalations', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 3,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    expect(screen.getByText(/multiple decisions pending/i)).toBeInTheDocument()
  })

  it('does not show urgency indicator for single escalation', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 1,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    expect(screen.queryByText(/multiple decisions pending/i)).not.toBeInTheDocument()
  })

  it('displays badge count correctly', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 5,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('displays 9+ for counts over 9', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 15,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('has accessible alert role', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 2,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    const banner = screen.getByRole('alert')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })

  it('has link to escalations page', () => {
    vi.mocked(hooks.usePendingEscalationCount).mockReturnValue({
      count: 1,
      isLoading: false,
      error: null,
    })

    render(<EscalationBanner />, { wrapper })

    const link = screen.getByRole('link', { name: /review now/i })
    expect(link).toHaveAttribute('href', '/escalations')
  })
})
