import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BriefingPanel } from '../briefing-panel';
import { useBriefing, useGenerateBriefing } from '@/lib/hooks/use-briefings';

vi.mock('@/lib/hooks/use-briefings', () => ({
  useBriefing: vi.fn(),
  useGenerateBriefing: vi.fn(),
}));

describe('BriefingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useGenerateBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });
  });

  it('shows "Select a project" message when projectId is undefined', () => {
    (useBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<BriefingPanel projectId={undefined} />);

    expect(
      screen.getByText('Select a project to generate a briefing.')
    ).toBeDefined();
  });

  it('shows loading skeleton when isLoading', () => {
    (useBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: true,
    });

    const { container } = render(<BriefingPanel projectId="proj-1" />);

    // Loading skeleton renders pulse divs
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders briefing sections when data is available', () => {
    (useBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 'b-1',
        projectId: 'proj-1',
        meetingType: 'standup',
        title: 'Standup Briefing',
        generatedAt: '2026-02-07T09:00:00Z',
        sections: [
          {
            heading: 'Sprint Progress',
            content: 'On track for delivery.',
            priority: 'high',
          },
          {
            heading: 'Blockers',
            content: 'No blockers reported.',
            priority: 'low',
          },
        ],
      },
      isLoading: false,
    });

    render(<BriefingPanel projectId="proj-1" />);

    expect(screen.getByText('Standup Briefing')).toBeDefined();
    expect(screen.getByText('Sprint Progress')).toBeDefined();
    expect(screen.getByText('On track for delivery.')).toBeDefined();
    expect(screen.getByText('Blockers')).toBeDefined();
    expect(screen.getByText('No blockers reported.')).toBeDefined();
  });

  it('shows Generate button', () => {
    (useBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<BriefingPanel projectId="proj-1" />);

    expect(screen.getByText('Generate')).toBeDefined();
  });

  it('shows error message when generation fails', () => {
    (useBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
    });
    (useGenerateBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
    });

    render(<BriefingPanel projectId="proj-1" />);

    expect(
      screen.getByText('Failed to generate briefing. Please try again.')
    ).toBeDefined();
  });

  it('shows "No data available" when sections are empty', () => {
    (useBriefing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: 'b-2',
        projectId: 'proj-1',
        meetingType: 'standup',
        title: 'Empty Briefing',
        generatedAt: '2026-02-07T09:00:00Z',
        sections: [],
      },
      isLoading: false,
    });

    render(<BriefingPanel projectId="proj-1" />);

    expect(
      screen.getByText('No data available for this project yet.')
    ).toBeDefined();
  });
});
