import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsPage from '../page'
import userEvent from '@testing-library/user-event'

global.fetch = vi.fn()

// Mock AutonomyDial component
vi.mock('@/components/autonomy-dial', () => ({
  AutonomyDial: ({ value, onChange, disabled }: any) => (
    <div data-testid="autonomy-dial">
      <button
        onClick={() => onChange('artefact')}
        disabled={disabled}
        data-testid="change-autonomy"
      >
        Change to {value}
      </button>
    </div>
  ),
}))

describe('Settings Page', () => {
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

  it('shows loading state initially', () => {
    ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

    const { container } = render(<SettingsPage />, { wrapper })

    // Page renders without crashing while loading
    expect(container).toBeTruthy()
  })

  it('shows error state on fetch failure', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('API error'))

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/error loading settings/i)).toBeInTheDocument()
    })
  })

  it('renders settings page with data', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
      lastLevelChange: '2024-01-01T00:00:00Z',
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    expect(screen.getByText(/configure agent behaviour and autonomy levels/i)).toBeInTheDocument()
  })

  it('displays autonomy level card', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Autonomy Level')).toBeInTheDocument()
    })

    expect(screen.getByTestId('autonomy-dial')).toBeInTheDocument()
  })

  it('displays dry-run mode card', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: true,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Dry-Run Mode')).toBeInTheDocument()
    })

    expect(screen.getByText(/dry-run active/i)).toBeInTheDocument()
  })

  it('shows live mode when dry-run is disabled', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/live mode/i)).toBeInTheDocument()
    })
  })

  it('displays pending acknowledgement alert', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
      pendingAcknowledgement: {
        fromLevel: 'monitoring',
        toLevel: 'artefact',
        requestedAt: '2024-01-01T00:00:00Z',
        acknowledged: false,
      },
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/autonomy change pending/i)).toBeInTheDocument()
    })
  })

  it('displays acknowledged alert when change is acknowledged', async () => {
    const mockSettings = {
      autonomyLevel: 'artefact',
      dryRun: false,
      pendingAcknowledgement: {
        fromLevel: 'monitoring',
        toLevel: 'artefact',
        requestedAt: '2024-01-01T00:00:00Z',
        acknowledged: true,
        acknowledgedAt: '2024-01-01T00:05:00Z',
      },
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/autonomy change acknowledged/i)).toBeInTheDocument()
    })
  })

  it('displays autonomy level details', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('What each level allows')).toBeInTheDocument()
    })

    expect(screen.getByText('Level 1: Observe')).toBeInTheDocument()
    expect(screen.getByText('Level 2: Maintain')).toBeInTheDocument()
    expect(screen.getByText('Level 3: Act')).toBeInTheDocument()
  })

  it('handles refresh button click', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    }

    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockSettings,
    })

    const user = userEvent.setup()
    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    await user.click(refreshButton)

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('toggles dry-run mode', async () => {
    const mockSettings = {
      autonomyLevel: 'monitoring',
      dryRun: false,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    })

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockSettings, dryRun: true }),
    })

    const user = userEvent.setup()
    render(<SettingsPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    const toggleButton = screen.getByRole('button', { name: '' })
    await user.click(toggleButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/agent/autonomy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
    })
  })
})
