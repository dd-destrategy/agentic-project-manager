import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import DashboardPage from '../page';

// Mock Next.js dynamic imports
vi.mock('next/dynamic', () => ({
  default: (fn: () => Promise<any>, options?: any) => {
    const Component = () => {
      if (options?.loading) {
        return options.loading();
      }
      return <div>Dynamic Component</div>;
    };
    Component.displayName = 'DynamicComponent';
    return Component;
  },
}));

// Mock the child components
vi.mock('@/components/agent-status', () => ({
  AgentStatus: () => <div data-testid="agent-status">Agent Status</div>,
}));

vi.mock('@/components/escalation-banner', () => ({
  EscalationBanner: () => (
    <div data-testid="escalation-banner">Escalation Banner</div>
  ),
}));

vi.mock('@/components/budget-status', () => ({
  BudgetStatusCompact: () => (
    <div data-testid="budget-status">Budget Status</div>
  ),
}));

vi.mock('@/lib/hooks/use-budget', () => ({
  useBudgetStatus: () => ({ data: null, isLoading: false }),
}));

describe('Dashboard Page', () => {
  it('renders without crashing', () => {
    render(<DashboardPage />);
    expect(screen.getByText(/mission control/i)).toBeInTheDocument();
  });

  it('displays page title and description', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Mission Control')).toBeInTheDocument();
    expect(
      screen.getByText(/real-time agent monitoring and project health/i)
    ).toBeInTheDocument();
  });

  it('renders AgentStatus component', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('agent-status')).toBeInTheDocument();
  });

  it('renders EscalationBanner component', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('escalation-banner')).toBeInTheDocument();
  });

  it('has correct layout structure', () => {
    const { container } = render(<DashboardPage />);
    const mainContainer = container.querySelector('.space-y-6');
    expect(mainContainer).toBeInTheDocument();
  });

  it('has grid layout for main content', () => {
    const { container } = render(<DashboardPage />);
    const grid = container.querySelector('.grid.grid-cols-12');
    expect(grid).toBeInTheDocument();
  });
});
