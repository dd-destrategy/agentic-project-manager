import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DecisionTracker } from '../decision-tracker';
import {
  useDecisions,
  useUpdateDecisionOutcome,
} from '@/lib/hooks/use-decisions';
import type { DecisionWithOutcome } from '@/types';

vi.mock('@/lib/hooks/use-decisions', () => ({
  useDecisions: vi.fn(),
  useUpdateDecisionOutcome: vi.fn(),
}));

const mockDecisions: DecisionWithOutcome[] = [
  {
    id: 'dec-1',
    title: 'Use DynamoDB for storage',
    context: 'Need a database for the project.',
    decision: 'We chose DynamoDB for its cost efficiency.',
    rationale: 'Low cost at our scale.',
    madeBy: 'user',
    date: '2026-01-15T10:00:00Z',
    status: 'active',
  },
  {
    id: 'dec-2',
    title: 'Adopt Step Functions',
    context: 'Need orchestration for agent.',
    decision: 'Step Functions chosen over custom solution.',
    rationale: 'Serverless, pay-per-use.',
    madeBy: 'agent',
    date: '2026-01-20T10:00:00Z',
    status: 'active',
    outcomeStatus: 'successful',
    outcome: 'Working well.',
  },
  {
    id: 'dec-3',
    title: 'Switch to Haiku for triage',
    context: 'Budget constraints.',
    decision: 'Use Haiku 4.5 for 70% of calls.',
    rationale: 'Significantly cheaper.',
    madeBy: 'user',
    date: '2026-02-01T10:00:00Z',
    status: 'active',
    outcomeStatus: 'pending',
  },
];

describe('DecisionTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useUpdateDecisionOutcome as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('shows loading skeleton when isLoading', () => {
    (useDecisions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { container } = render(<DecisionTracker projectId="proj-1" />);

    expect(screen.getByText('Decision Outcome Tracker')).toBeDefined();
    // Skeleton elements should be present
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message when error occurs', () => {
    (useDecisions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    });

    render(<DecisionTracker projectId="proj-1" />);

    expect(screen.getByText('Failed to load decisions')).toBeDefined();
  });

  it('renders decision cards with title and status', () => {
    (useDecisions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { decisions: mockDecisions, projectId: 'proj-1' },
      isLoading: false,
      error: null,
    });

    render(<DecisionTracker projectId="proj-1" />);

    expect(screen.getByText('Use DynamoDB for storage')).toBeDefined();
    expect(screen.getByText('Adopt Step Functions')).toBeDefined();
    expect(screen.getByText('Switch to Haiku for triage')).toBeDefined();
  });

  it('shows filter tabs (All, Active, Pending Review, Completed)', () => {
    (useDecisions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { decisions: mockDecisions, projectId: 'proj-1' },
      isLoading: false,
      error: null,
    });

    render(<DecisionTracker projectId="proj-1" />);

    expect(screen.getByRole('button', { name: /All/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Active/ })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Pending Review/ })
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Completed/ })).toBeDefined();
  });

  it('shows empty state for filtered view with no results', () => {
    (useDecisions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { decisions: [], projectId: 'proj-1' },
      isLoading: false,
      error: null,
    });

    render(<DecisionTracker projectId="proj-1" />);

    expect(screen.getByText('No decisions in this category')).toBeDefined();
  });

  it('displays correct count of decisions', () => {
    (useDecisions as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { decisions: mockDecisions, projectId: 'proj-1' },
      isLoading: false,
      error: null,
    });

    render(<DecisionTracker projectId="proj-1" />);

    expect(screen.getByText('3 decisions')).toBeDefined();
  });
});
